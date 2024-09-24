import { Disposable, isLinux, isWindows } from '@idlebox/common';
import { resolvePath } from '@idlebox/node';
import { randomBytes } from 'crypto';
import { chmodSync, mkdirSync } from 'fs';
import { createServer, Server, Socket } from 'net';
import { tmpdir } from 'os';
import { dirname } from 'path';
import { window } from 'vscode';
import sh from '../ipc/askpass.sh';

const askpassShell = resolvePath(__dirname, sh);
const clientJs = resolvePath(__dirname, 'ipc/client.js');

export abstract class IPCServer extends Disposable {
	private readonly tokens = new Set<string>();
	private _socketPath?: string;
	private readonly server: Server;
	private readonly id = randomBytes(5).toString('hex');
	protected tokenValidTime: number = 0;

	constructor() {
		super();

		if (!isWindows) {
			chmodSync(askpassShell, 0o700);
		}

		this.server = createServer(this.handle.bind(this));
	}

	protected ensureListen() {
		if (this._socketPath) {
			return this._socketPath;
		}
		const socket = this.build_socket_path();
		this._socketPath = socket;
		this.server.listen(socket);
		return this._socketPath;
	}

	get socket() {
		return this._socketPath!;
	}

	private build_socket_path(): string {
		if (isWindows) {
			return `\\\\.\\pipe\\my-git-${this.id}-sock`;
		} else if (isLinux) {
			return '\0/run/vscode/my-git-${this.id}.sock';
		}

		const path = resolvePath(tmpdir(), `vscode-server/my-git-${this.id}.sock`);
		mkdirSync(dirname(path), { mode: 0o755, recursive: true });
		return path;
	}

	createToken() {
		const token = randomBytes(16).toString('hex');
		this.tokens.add(token);
		if (this.tokenValidTime > 0) {
			setTimeout(() => {
				this.tokens.delete(token);
			}, this.tokenValidTime);
		}
		return token;
	}

	protected handle(stream: Socket) {
		console.log('[server] new connection');

		stream.on('data', async (c) => {
			const text = c.toString('utf-8').trim();
			console.log('[server] recv-data:', text);
			if (this.tokens.has(text)) {
				try {
					const data = await this.data();
					stream.write(JSON.stringify(data));
				} catch (e: any) {
					window.showErrorMessage(e.message);
				}

				stream.end();
			} else {
				console.log('[server] invalid connection token');
				stream.end();
			}
		});
	}

	environ(): Record<string, string> {
		return {
			GIT_ASKPASS: askpassShell,
			IPC_NODEJS_PATH: process.execPath,
			IPC_SCRIPT_FILE: clientJs,
			IPC_TOKEN: this.createToken(),
			IPC_SOCKET: this.ensureListen(),
		};
	}
	protected abstract data(): Promise<any>;

	override dispose() {
		this.server.close();
		super.dispose();
	}
}
