import { oneMinute } from '@idlebox/common';
import { l10n, window } from 'vscode';
import { listenConfig, listenGlobalConfig, setConfig } from '../helpers/shorthand';
import { IPCServer } from '../ipc/server';
import { channel, context } from '../main';
import { git } from './git-executer';

class Credential extends IPCServer {
	private username: string = '';
	private password: string = '';
	private useAskPass = true;

	constructor() {
		super();

		this._register(
			listenConfig(['username', 'password'], (config) => {
				this.username = config.username;
				this.password = config.password;
			}),
		);

		this._register(
			listenGlobalConfig('git', ['useIntegratedAskPass'], (config) => {
				this.useAskPass = !!config.useIntegratedAskPass;
				if (!this.useAskPass) {
					channel.appendLine('note: not using integrated askpass');
				}
			}),
		);
	}

	async checkCoreCredential() {
		const type = await git.exec(['config', '--get', 'credential.helper']);
		if (type === 'manager') {
			channel.appendLine(`git credential.helper=manager`);
			this.tokenValidTime = 30 * oneMinute;
		} else {
			channel.appendLine(`git credential.helper=${type || '*not set*'}`);
			this.tokenValidTime = 1 * oneMinute;
		}
	}

	protected override async data() {
		if (!this.username) {
			const username = (await window.showInputBox({ ignoreFocusOut: true, title: l10n.t('Please input your username') })) || '';
			if (username) {
				setConfig('username', username);
			}
		}
		if (!this.password) {
			const password = (await window.showInputBox({ ignoreFocusOut: true, title: l10n.t('Please input your password'), password: true })) || '';
			if (password) {
				setConfig('password', password);
			}
		}

		const r = { username: this.username, password: this.password };
		console.log('[Credential] response data:', r);
		return r;
	}

	override environ(): Record<string, string> {
		if (!this.useAskPass) {
			return {};
		}
		return super.environ();
	}
}

export const credential = new Credential();
context.subscriptions.push(credential);
