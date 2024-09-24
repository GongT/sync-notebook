import { Disposable, isWindows, toDisposable } from '@idlebox/common';
import { commandInPath, PathEnvironment } from '@idlebox/node';
import { Mutex } from 'async-mutex';
import { execa, Options } from 'execa';
import vscode, { CancellationToken, CancellationTokenSource } from 'vscode';
import { MY_CANCEL_ERROR } from '../helpers/lock';
import { CURRENT_DIRECTORY, GITDIR_FULL_PATH, WORKTREE_FULL_PATH } from '../helpers/paths';
import { listenGlobalConfig } from '../helpers/shorthand';
import { channel, context } from '../main';
import { credential } from './credential';

interface IGitOptions {
	readonly abort?: CancellationToken;
	readonly input?: string;
}

export function createTransform(hint: string) {
	return function* (line: unknown): Generator<string, void, void> {
		channel.appendLine(`${hint}> ${line}`);
		yield line as any;
	};
}

export class ExecError extends Error {
	constructor(
		public readonly command: string[],
		public readonly stdout: string,
		public readonly stderr: string,
		public readonly exitCode: number,
		message: string,
	) {
		super(message);
	}
}

let findMemCache: string | undefined;

const mutex = new Mutex(MY_CANCEL_ERROR);

/**
 * 运行git命令
 */
class GitExecuter extends Disposable {
	private readonly mutex = mutex;
	private gitpath?: string;
	private abortSource = new CancellationTokenSource();

	private readonly noGitError = new Error(vscode.l10n.t('Cannot find git in PATH, please set git.path in settings.'));

	constructor() {
		super();
		this._register(toDisposable(this.mutex.cancel.bind(this.mutex)));
		const cfg = this._register(listenGlobalConfig('git', ['path'], this.changeConfig.bind(this), false));

		this.changeConfig(cfg);

		this.noGitError.stack = this.noGitError.message;
	}

	private changeConfig(config: { path?: unknown }) {
		this.mutex
			.runExclusive(async () => {
				this.gitpath = await this.findGit(typeof config.path === 'string' ? config.path : '');
			})
			.catch((e) => {
				channel.appendLine(`error during find git, this should not happen: ${e}`);
			});
	}

	private async findGit(configValue: string) {
		if (configValue) {
			return configValue;
		}
		if (findMemCache) {
			return findMemCache;
		}

		channel.appendLine('try to find git binary:');

		// todo: store cache in global state

		findMemCache = await commandInPath('git');
		channel.appendLine(`  - %path% = ${findMemCache}`);
		if (!findMemCache) {
			const pathVar = new PathEnvironment();
			channel.appendLine(`PATH:\n${[...pathVar.values()].join('\n')}`);
			channel.appendLine(`:: failed`);
			throw this.noGitError;
		}
		channel.appendLine(`:: found`);
		return findMemCache;
	}

	lock<T>(fn: () => Promise<T>) {
		return this.mutex.runExclusive(fn);
	}

	async abort() {
		this.mutex.cancel();
		this.abortSource.cancel();
	}
	async exec(args: ReadonlyArray<string>, options: IGitOptions = {}) {
		try {
			await this.mutex.acquire();
			this.createAbort(options.abort);
			return await this.__execute(args, options);
		} finally {
			this.mutex.release();
		}
	}

	async batch(commands: readonly ReadonlyArray<string>[], options: IGitOptions = {}) {
		try {
			await this.mutex.acquire();
			const _abortsignal = this.createAbort(options.abort);
			let last = '';
			for (const args of commands) {
				last = await this.__execute(args, options);
				console.assert(!_abortsignal.isCancellationRequested, 'this should not execute, since the above line must throw');
			}
			return last;
		} finally {
			this.mutex.release();
		}
	}

	private createAbort(chain?: CancellationToken) {
		const abortSource = new CancellationTokenSource();
		if (chain) {
			chain.onCancellationRequested(() => {
				channel.appendLine('parent request git abort.');
				abortSource.cancel();
			});
		}
		this.abortSource = abortSource;
		return abortSource.token;
	}

	private async __execute(args: ReadonlyArray<string>, options: IGitOptions) {
		if (!this.gitpath) {
			throw this.noGitError;
		}
		const actionTip = args[0];

		if (actionTip.startsWith('-')) {
			throw new Error('no!');
		}

		let isConfigCmd = actionTip === 'config',
			isGetConfig = isConfigCmd && args[1] === '--get';
		if (!isConfigCmd) {
			channel.appendLine(`command[${actionTip}]> git ${debugArgs(args)}`);
		}

		let result;
		try {
			const process = execa(this.gitpath, args, {
				env: {
					...credential.environ(),
					GIT_CEILING_DIRECTORIES: CURRENT_DIRECTORY,
					LANG: 'C.utf-8',
					GIT_DIR: GITDIR_FULL_PATH,
					GIT_WORK_TREE: WORKTREE_FULL_PATH,
				},
				cwd: CURRENT_DIRECTORY,
				stdin: options.input ? Buffer.from(options.input) : 'ignore',
				stdout: isConfigCmd ? 'pipe' : createTransform('stdout'),
				stderr: isConfigCmd ? 'pipe' : createTransform('stderr'),
				encoding: 'utf8',
				stripFinalNewline: true,
				reject: false,
			} satisfies Options);

			this.abortSource.token.onCancellationRequested(() => {
				channel.appendLine(`received cancel signal`);
				process.kill(isWindows ? 'SIGKILL' : 'SIGTERM');
			});

			result = await process;
		} catch (e: any) {
			channel.appendLine(`exit> execute fail: ${e?.message ?? e}`);
			channel.appendLine('');
			throw e;
		}

		if ((result.exitCode && !isGetConfig) || result.signal || result.isCanceled) {
			const e = result.isCanceled ? `canceled` : result.signal ? `killed by signal ${result.signal}` : `exit with code ${result.exitCode}`;

			channel.appendLine(`exit> [${actionTip}] ${e}`);
			throw new ExecError(['git', ...args], result.stdout, result.stderr, result.exitCode || 1, e);
		}
		if (!isConfigCmd) {
			channel.appendLine(`exit> [${actionTip}] complete`);
		}
		channel.appendLine('');

		return result.stdout;
	}
}

export const git = new GitExecuter();
context.subscriptions.push(git);

function debugArgs(args: ReadonlyArray<string>) {
	return args.map((e) => JSON.stringify(e)).join(' ');
}
