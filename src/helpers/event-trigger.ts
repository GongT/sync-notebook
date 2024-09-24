import { Emitter, EventHandler, IDisposable } from '@idlebox/common';

export class Trigger<T> extends Emitter<T> {
	private _memo?: T;
	private is_fire = false;

	get fired() {
		return this.is_fire;
	}

	public override fire(data: T) {
		if (this.is_fire) {
			throw Error('Trigger already fired');
		}
		super.fire(data);
		this._memo = data;
		this.is_fire = true;
	}

	public override fireNoError(data: T) {
		if (this.is_fire) {
			throw Error('Trigger already fired');
		}
		super.fireNoError(data);
		this._memo = data;
		this.is_fire = true;
	}

	// public override dispose() {
	// 	if (!this._memo) {
	// 		throw Error('Trigger never fired');
	// 	}
	// 	super.dispose();
	// }

	public override handle(callback: EventHandler<T>): IDisposable {
		if (this.is_fire) {
			callback(this._memo!);
			return nodispose;
		}
		const self = super.handle((e) => {
			self.dispose();
			callback(e);
		});

		return self;
	}
}

const nodispose = { dispose() {} };
