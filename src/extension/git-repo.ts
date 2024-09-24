import { Disposable, toDisposable } from '@idlebox/common';
import vscode from 'vscode';
import { CancelableLock } from '../helpers/lock';
import { getCurrentConfig, IMyConfig, listenConfig } from '../helpers/shorthand';
import { channel, context } from '../main';
import { GitWorkTree } from './git-worktree';
import { InitState, switchBusy, switchState } from './state-context';

const configs = ['repo', 'branch.master', 'branch.save', 'branch.force'] as const;
type LocalConfig = Pick<IMyConfig, (typeof configs)[number]>;

class GitRepo extends Disposable {
	private readonly _onRepoRefresh = this._register(new vscode.EventEmitter<void>());
	/** repo entire change, eg. new clone */
	public readonly onRepoRefresh = this._onRepoRefresh.event;

	private readonly config = getCurrentConfig(configs);
	private readonly lock = this._register(new CancelableLock());
	public readonly worktreePath = 'worktree';
	public readonly gitDirPath = 'git';
	private wt!: GitWorkTree;

	constructor() {
		super();
		const cfg = this._register(listenConfig(configs, this.changeConfig.bind(this)));
		this._register(this.lock.onBusy(switchBusy));
		this._register(
			toDisposable(() => {
				this.wt?.dispose();
			}),
		);

		Object.assign(this.config, cfg);
		this.switchWorkingTree();
	}

	private async switchWorkingTree() {
		if (this.wt) {
			if (this.wt.remoteUrl === this.config.repo && this.wt.branch === this.config['branch.master']) {
				return;
			}
			this.wt.dispose();
			// channel.clear();
		}

		this.wt = new GitWorkTree({
			remoteUrl: this.config.repo,
			branch: this.config['branch.master'],
		});

		channel.appendLine('switch worktree:');
		channel.appendLine(`  * working tree: ${this.worktreePath}`);
		channel.appendLine(`  * git dir: ${this.gitDirPath}`);
		channel.appendLine(`  * remote: ${this.wt.remoteUrl}`);
		channel.appendLine(`  * branch: ${this.wt.branch}`);
	}

	private changeConfig(config: LocalConfig) {
		channel.appendLine('receive new settings.');
		Object.assign(this.config, config);

		this.refreshConfig();
	}

	refreshConfig() {
		this.switchWorkingTree();

		return this.lock
			.executeJob('check & fix', true, async () => {
				if (this.config.repo) {
					channel.appendLine(` - fix error if any`);
					await this.wt.fix();
					switchState(InitState.Exists);
				} else {
					channel.appendLine(` - no repo configured`);
					switchState(InitState.Empty);
					this._onRepoRefresh.fire();
				}
			})
			.catch((e) => {
				switchState(InitState.Empty);
				vscode.window.showErrorMessage(vscode.l10n.t(`failed refresh repo: reason:`) + e.message);
			});
	}
}

export const gitrepo = new GitRepo();
context.subscriptions.push(gitrepo);

context.subscriptions.push(
	vscode.commands.registerCommand('gitanywhere.refresh', () => {
		channel.clear();
		channel.appendLine('manual refresh by command');
		return gitrepo.refreshConfig();
	}),
);
