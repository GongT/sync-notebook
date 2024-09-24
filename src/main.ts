import { commands, ExtensionContext, l10n, OutputChannel, window } from 'vscode';
console.log('plugin load: ', require('@@buildtime'));

export let channel: OutputChannel;
export let context: ExtensionContext;

const absolutePathRegex = /^([/\\]{2}|[a-z]:|\/)/i;

export async function activate(_context: ExtensionContext, _channel: OutputChannel) {
	context = _context;
	channel = _channel;

	channel.appendLine(`[startup] plugin built at ${require('@@buildtime')}`);

	channel.appendLine('[startup] globalStorageUri = ' + context.globalStorageUri.fsPath);
	if (!absolutePathRegex.test(context.globalStorageUri.fsPath)) {
		window.showErrorMessage(l10n.t('The {0} extension can only works on local installed ', 'Git Anywhere'));
		return;
	}

	if (process.env.MY_EXTENSION_DEBUG_MODE) {
		console.log(context.extension.packageJSON);
		Object.assign(globalThis, { vscode: require('vscode'), environ: process.env, context });
	}

	context.subscriptions.push(
		commands.registerCommand('gitanywhere.opensettings', () => {
			return commands.executeCommand('workbench.action.openSettings', '@ext:gongt.git-anywhere');
		}),
	);

	await import('./extension/git-repo');
}

export function deactivate() {}
