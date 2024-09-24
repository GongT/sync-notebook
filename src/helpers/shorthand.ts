import { IDisposable } from '@idlebox/common';
import vscode from 'vscode';

export interface IMyConfig {
	repo: string;
	username: string;
	password: string;
	'branch.master': string;
	'branch.save': string;
	'branch.force': number;
}

export function getCurrentConfig<K extends keyof IMyConfig>(keys: readonly K[]): Pick<IMyConfig, K> {
	const r: any = {};
	const scope = vscode.workspace.getConfiguration('gitanywhere');
	for (const item of keys) {
		r[item] = scope.get(item);
	}
	return r;
}

export function setConfig<K extends keyof IMyConfig>(key: K, value: IMyConfig[K]) {
	const scope = vscode.workspace.getConfiguration('gitanywhere');
	scope.update(key, value, vscode.ConfigurationTarget.Global);
}

export function listenGlobalConfig<T extends string>(
	section: string,
	keys: readonly T[],
	callback: (config: Record<T, unknown>) => void,
	immediate = true,
): Record<T, unknown> & IDisposable {
	const r: any = {};

	const create = () => {
		const settings = vscode.workspace.getConfiguration(section);
		for (const item of keys) {
			r[item] = settings.get(item);
		}
		console.log('[config] notify changed:', section, r);
	};

	const dis = vscode.workspace.onDidChangeConfiguration((configChangedEvent) => {
		for (const item of keys) {
			if (configChangedEvent.affectsConfiguration(section + '.' + item)) {
				create();
				callback(r);
				return;
			}
		}
	});
	Object.defineProperty(r, 'dispose', {
		configurable: false,
		enumerable: false,
		value: dis.dispose.bind(dis),
		writable: false,
	});

	create();
	if (immediate) {
		setImmediate(() => callback(r));
	}
	return r;
}

export function listenConfig<K extends keyof IMyConfig>(
	keys: readonly K[],
	callback: (config: Pick<IMyConfig, K>) => void,
	immediate = true,
): Pick<IMyConfig, K> & IDisposable {
	return listenGlobalConfig('gitanywhere', keys, callback as any, immediate) as any;
}

export function waitForEvent<T = any>(event: vscode.Event<T>): Promise<T> {
	return new Promise<T>((resolve) => {
		event(resolve);
	});
}
