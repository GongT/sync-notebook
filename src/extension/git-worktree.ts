import { Disposable } from '@idlebox/common';
import { rm } from 'fs/promises';
import { l10n } from 'vscode';
import { isDir } from '../helpers/fs';
import { GITDIR_FULL_PATH, WORKTREE_FULL_PATH } from '../helpers/paths';
import { channel } from '../main';
import { ExecError, git } from './git-executer';

const missingBranch = /Remote branch .+ not found in upstream/;

export interface IWorkTree {
	readonly remoteUrl: string;
	readonly branch: string;
}

async function impossible() {
	throw new Error(l10n.t('conflict impossible to resolve automatically'));
}

/**
 * git仓库抽象
 */
export class GitWorkTree extends Disposable {
	readonly remoteUrl;
	readonly branch;

	private _fix?: () => Promise<any>;

	constructor(options: IWorkTree) {
		super();

		this.remoteUrl = options.remoteUrl;
		this.branch = options.branch;
	}

	async clone() {
		git.lock(async () => {
			channel.appendLine('remove exists folder');
			await rm(WORKTREE_FULL_PATH, { force: true, recursive: true, maxRetries: 5, retryDelay: 1000 });
			await rm(GITDIR_FULL_PATH, { force: true, recursive: true, maxRetries: 5, retryDelay: 1000 });
		});
		try {
			await git.exec([
				'clone',
				'--depth',
				'5',
				'--recurse-submodules',
				'--shallow-submodules',
				'--single-branch',
				'--branch',
				this.branch,
				this.remoteUrl,
				WORKTREE_FULL_PATH,
			]);
		} catch (e: unknown) {
			if (e instanceof ExecError) {
				if (missingBranch.test(e.stderr)) {
					channel.appendLine('missing remote branch.');
					await git.exec(['init', '-b', this.branch, WORKTREE_FULL_PATH]);
					await git.exec(['remote', 'add', '-t', this.branch, '-m', this.branch, 'origin', this.remoteUrl]);
					await git.exec(['commit', '--allow-empty', '-m', 'Initial commit']);
					await git.exec(['push', '--set-upstream', 'origin', this.branch]);
				}
			}
			throw e;
		}

		await git.exec(['config', '--replace-all', 'pull.rebase', 'true']);
	}

	async reset() {
		await git.batch([
			['checkout', '-f', this.branch],
			['clean', '-ffdx'],
		]);
	}

	async pack() {
		throw new Error('impl pack');
	}
	async commit() {
		await git.batch([
			['add', '--all'],
			['push', '--set-upstream', 'origin', this.branch],
		]);
	}
	async push() {
		await git.exec(['push', '--set-upstream', 'origin', this.branch]);
	}
	async pull() {
		try {
			await git.exec(['pull', '--rebase']);
		} catch (e) {
			if (e instanceof ExecError) {
				try {
					await git.exec(['rebase', '--abort']);
				} catch {}
			}
			throw e;
		}
	}
	async squash(_onto: string) {
		throw new Error('impl squash');
	}

	async fix() {
		if (await this.exists()) {
			git.exec(['fetch']);
		}
		let jobs = 0;
		while (jobs++ < 5) {
			channel.appendLine(`[${jobs}] fix worktree ======================`);
			try {
				await this.sanity();
				return;
			} catch {
				if (this._fix) {
					await this._fix();
				} else {
					break;
				}
			}
		}

		if (this._fix) {
			throw new Error('failed to fix issues');
		}
	}

	async exists() {
		if (!(await isDir(WORKTREE_FULL_PATH))) {
			return false;
		}
		if (!(await isDir(GITDIR_FULL_PATH))) {
			return false;
		}
		return true;
	}

	async sanity() {
		this._fix = this.clone;

		if (!(await this.exists())) {
			throw new Error(l10n.t('worktree is not exists'));
		}
		channel.appendLine(`  - directory exists.`);

		try {
			await git.exec(['fsck']);
		} catch (e) {
			if (e instanceof ExecError) {
				throw new Error(l10n.t('worktree broken: {0}', e.stderr));
			} else {
				throw new Error(l10n.t('fsck has failed: {0}', (e as any)?.message ?? e));
			}
		}
		channel.appendLine(`  - fsck complete.`);

		const remote = await git.exec(['remote', 'get-url', 'origin']).catch(() => '');
		if (remote !== this.remoteUrl) {
			throw new Error(l10n.t('remote url has changed'));
		}
		channel.appendLine(`  - current remote: ${remote}`);

		this._fix = this.reset;
		const branch = await git.exec(['branch', '--show-current']);
		if (branch !== this.branch) {
			throw new Error(l10n.t('branch has changed'));
		}
		channel.appendLine(`  - same branch: ${branch}`);

		this._fix = this.clone;
		const stats = await this.status();

		if (stats.changes) {
			this._fix = this.commit;
			throw new Error(l10n.t('uncommited files'));
		}
		channel.appendLine(`  - no changes`);

		if (stats.ahead || stats.behind) {
			if (stats.ahead && stats.behind) {
				try {
					await git.exec(['rebase', '--onto', 'origin/master']);
				} catch {
					this._fix = impossible;
					await git.exec(['rebase', '--abort']);
					throw new Error(l10n.t('conflict'));
				}
			} else if (stats.ahead) {
				this._fix = this.push;
				throw new Error(l10n.t('branch ahead of remote'));
			} else {
				this._fix = this.pull;
				throw new Error(l10n.t('branch behind of remote'));
			}
		}

		channel.appendLine(`  - greate, workspace clean`);
		delete this._fix;
	}

	async status() {
		let out: string;

		out = await git.exec(['rev-list', '--left-right', '--count', `${this.branch}...origin/${this.branch}`]);
		const [ahead, behind] = out.split('\t').map(parseInt);

		out = await git.exec(['status', '--porcelain']);
		out = out.trim();
		const changes = out ? out.split('\n').length : 0;

		return {
			ahead,
			behind,
			changes,
		};
	}
}
