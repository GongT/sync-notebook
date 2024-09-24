import { stat } from 'fs/promises';

export async function isDir(f: string) {
	try {
		const ss = await stat(f);
		return ss.isDirectory();
	} catch {
		return false;
	}
}
