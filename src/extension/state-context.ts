export const contextKeyState = 'gitanywhere.state';
export const contextKeyBusy = 'gitanywhere.busy';
import vscode, { commands } from 'vscode';
import { channel } from '../main';

export enum InitState {
	Empty = 'empty',
	Init = 'init',
	Exists = 'exists',
}

export function switchBusy(busy: boolean) {
	vscode.commands.executeCommand('setContext', contextKeyBusy, busy);
}

export function switchState(state: InitState) {
	channel.appendLine(`state change -> ${state}`);
	commands.executeCommand('setContext', contextKeyState, state);
}
