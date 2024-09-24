import { IDisposable } from '@idlebox/common';
import { commands, ExtensionContext, OutputChannel, StatusBarAlignment, ThemeColor, window } from 'vscode';

function wrapContext(context: ExtensionContext): ExtensionContext {
	const subscriptions: IDisposable[] = [];
	return new Proxy(
		{},
		{
			get(_, p, receiver) {
				if (p === 'subscriptions') {
					return subscriptions;
				}
				return Reflect.get(context, p, receiver);
			},
			set(target, p, newValue, receiver) {
				return Reflect.set(target, p, newValue, receiver);
			},
		},
	) as any;
}

function nocacheRequire(file: string) {
	const abs = require.resolve(file);
	delete require.cache[abs];
	return require(abs);
}

function doActivate(context: ExtensionContext, channel: OutputChannel) {
	if (wrappedContext) {
		return;
	}
	const newContext = wrapContext(context);
	Promise.resolve()
		.then(() => {
			return nocacheRequire('./main.js').activate(newContext, channel);
		})
		.catch((e) => window.showErrorMessage(e.message));

	wrappedContext = newContext;
}

function doDeactive() {
	if (!wrappedContext) {
		return;
	}
	const context = wrappedContext;
	wrappedContext = undefined;
	require('./main').deactivate();
	for (const dis of context.subscriptions) {
		dis.dispose();
	}
}

let wrappedContext: ExtensionContext | undefined;
export function activate(context: ExtensionContext) {
	const channel = window.createOutputChannel('Git Any Where');
	context.subscriptions.push(channel);

	commands.executeCommand('setContext', 'gitanywhere.debug', true);
	doActivate(context, channel);

	context.subscriptions.push(
		commands.registerCommand('gitanywhere.hot-reload', () => {
			channel.clear();
			doDeactive();
			channel.appendLine('=====================================');
			channel.appendLine('reactive plugin');
			channel.appendLine('=====================================');
			doActivate(context, channel);
		}),
	);

	context.subscriptions.push(
		commands.registerCommand('gitanywhere.deactive', () => {
			doDeactive();
		}),
	);

	const bar = window.createStatusBarItem('gitanywhere.hot-reload', StatusBarAlignment.Right, 100000);
	context.subscriptions.push(bar);
	bar.text = '$(sync) 软重启';
	bar.backgroundColor = new ThemeColor('statusBarItem.prominentBackground');
	bar.command = 'gitanywhere.hot-reload';
	bar.show();
}
export function deactivate() {
	doDeactive();
}
