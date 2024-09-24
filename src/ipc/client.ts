import { timeout } from '@idlebox/common';
import { CollectingStream } from '@idlebox/node';
import { connect } from 'net';

(async () => {
	const question = process.argv[2];
	const token = process.env.IPC_TOKEN;
	const pipe_path = process.env.IPC_SOCKET;

	// console.error('got request:', question);
	// console.error('    connect:', pipe_path);
	// console.error('    with   :', token);

	if (!question || !token || !pipe_path) {
		console.error('missing required arguments');
		process.exit(1);
	}

	const socket = connect({ path: pipe_path });
	socket.write(token + '\n');

	socket.on('error', (e) => {
		console.error('socket error: %s', e);
		throw e;
	});

	const data = new CollectingStream(socket);
	const text = await Promise.race([data.promise(), timeout(30000, 'no response in 30s')]);
	// console.error('server response: %s', text);

	const json = JSON.parse(text);

	let resp = '';
	if (/password/i.test(question)) {
		resp = json.password;
	} else {
		resp = json.username;
	}
	// console.error(`will response <${resp}>`);
	if (!resp) {
		throw new Error('do not know how to response');
	}

	console.log(resp);
})().then(
	() => {
		process.exit(0);
	},
	(e) => {
		console.error(e.message);
		process.exit(1);
	},
);
