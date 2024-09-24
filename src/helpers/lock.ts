import { Disposable, Emitter, toDisposable } from '@idlebox/common';
import { Mutex } from 'async-mutex';
import vscode, { CancellationTokenSource } from 'vscode';
import { channel } from '../main';

export const MY_CANCEL_ERROR = new Error(vscode.l10n.t('Canceled'));

export class BusyError extends Error {
	constructor(current: string, running: string) {
		super(`BusyError: task "${current}" is running, "${running}" can not start.`);
	}
}

export class CancelableLock extends Disposable {
	private readonly _onBusy = this._register(new Emitter<boolean>());
	/** git program running, other job should lock */
	public readonly onBusy = this._onBusy.register;

	private mutex = new Mutex(MY_CANCEL_ERROR);

	private currentRunning?: string;
	private control?: CancellationTokenSource;

	constructor() {
		super();
		this._register(
			toDisposable(() => {
				this.mutex.cancel();
				this.control?.cancel();
			}),
		);
	}

	private async lockedRun(debugTitle: string, job: () => Promise<any>) {
		channel.appendLine(`[${debugTitle}] job started`);
		this._onBusy.fireNoError(true);
		const control = new CancellationTokenSource();
		this.control = control;
		this.currentRunning = debugTitle;

		try {
			await job();
		} finally {
			console.assert(debugTitle === this.currentRunning, 'invalid state, lock has broken somewhere');
			channel.appendLine(`[${debugTitle}] job finished`);
			delete this.currentRunning;
			delete this.control;
			control.dispose();
			this._onBusy.fireNoError(false);
		}
	}

	async executeJob(debugTitle: string, replace = false, job: () => Promise<any>): Promise<void> {
		channel.appendLine(`[${debugTitle}] acquire job lock`);

		const work = () => {
			return this.lockedRun(debugTitle, job);
		};

		if (replace && this.mutex.isLocked()) {
			channel.appendLine(`[${debugTitle}]   - cancel prev job (${this.currentRunning})`);
			this.mutex.cancel(); // clean wait queue
			const acq = this.mutex.runExclusive(work, 1000); // im'next
			this.control!.cancel(); // stop current
			channel.appendLine(`[${debugTitle}]   - signal is sent`);
			await acq;
		} else {
			await this.mutex.runExclusive(work, 1000);
		}
	}

	getBusy() {
		return this.mutex.isLocked();
	}
}
