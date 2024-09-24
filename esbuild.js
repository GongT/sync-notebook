const esbuild = require('esbuild');
const { pathToFileURL } = require('url');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('\x1Bc[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};
/**
 * @type {import('esbuild').Plugin}
 */
const timerPlugin = {
	name: 'time-inject',
	setup(build) {
		let time = 0;
		build.onStart(() => {
			time = Date.now();
		});
		build.onResolve({ filter: /^@@buildtime$/ }, () => {
			return {
				path: '@@buildtime',
				namespace: 'my-build-time',
				sideEffects: true,
				pluginData: {},
			};
		});
		build.onLoad({ filter: /^@@buildtime$/, namespace: 'my-build-time' }, () => {
			return {
				contents: time.toString(),
				loader: 'text',
			};
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: ['src/loader.ts', 'src/main.ts', 'src/ipc/client.ts'],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: true,
		platform: 'node',
		outdir: 'dist',
		external: ['vscode'],
		logLevel: 'silent',
		tsconfig: 'src/tsconfig.json',
		assetNames: '[name]',
		treeShaking: true,
		define: {
			__BUILD_TIME__: JSON.stringify(new Date().toISOString()),
		},
		loader: {
			'.sh': 'file',
		},
		plugins: [
			timerPlugin,
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
