// Builds the static TraceViz web demo into demo/dist (served e.g. by GitHub Pages under /traceviz/).
//
//   dist/index.html, dist/main.js         workbench page (all URLs relative to the page)
//   dist/vscode/                          VS Code for the Web (pinned release, unused parts removed)
//   dist/extensions/traceviz/             TraceViz web extension (npm run package-web)
//   dist/extensions/demo-workspace/       file system provider + MediaStore demo workspace
//
// Downloads are cached in demo/.cache. Usage: npm run demo:build
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// VS Code for the Web 1.147.0 (https://update.code.visualstudio.com/api/update/web-standalone/stable/latest)
const VSCODE_VERSION = '1.147.0';
const VSCODE_COMMIT = '8a14f0cc1b08d531eb83255ea3764ae22aa932b5';
const VSCODE_SHA256 = 'bca70ecae036b4e16c32a860d03bff45460fb1b0faccccda43d94a754fac84dd';
const VSCODE_URL = `https://vscode.download.prss.microsoft.com/dbazure/download/stable/${VSCODE_COMMIT}/vscode-web.tar.gz`;

// Parts of the VS Code web build that the demo does not need (keeps the site at about 120 MB instead of 240 MB)
const VSCODE_EXCLUDES = [
	'out/vs/sessions',                       // Agents window, a separate application
	'out/nls.keys.json',                     // build metadata, not loaded at runtime
	'out/nls.metadata.json',
	'extensions/mermaid-markdown-features',  // Mermaid diagrams in Markdown previews (66 MB)
];

// Demo data
const MEDIASTORE_COMMIT = '94c398fa02b3d6b8d71517522a7206d37ed3a9af';
const MEDIASTORE_URL = `https://codeload.github.com/ArDoCo/MediaStore3/tar.gz/${MEDIASTORE_COMMIT}`;
const BENCHMARK_COMMIT = 'e60ddb2676358048131178c925e86a5b33ec38f2';
const BENCHMARK_URL = `https://raw.githubusercontent.com/ArDoCo/Benchmark/${BENCHMARK_COMMIT}/mediastore`;

const demoDir = dirname(fileURLToPath(import.meta.url));
const repoDir = dirname(demoDir);
const cacheDir = join(demoDir, '.cache');
const distDir = join(demoDir, 'dist');

async function download(url, target, sha256) {
	if (!existsSync(target)) {
		console.log(`Downloading ${url}`);
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Download of ${url} failed: ${response.status} ${response.statusText}`);
		}
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, Buffer.from(await response.arrayBuffer()));
	}
	if (sha256) {
		const actual = createHash('sha256').update(readFileSync(target)).digest('hex');
		if (actual !== sha256) {
			rmSync(target);
			throw new Error(`Checksum mismatch for ${url}: expected ${sha256}, got ${actual}`);
		}
	}
	return target;
}

function extract(archive, target, stripComponents) {
	if (existsSync(target)) {
		return target;
	}
	const temp = `${target}.tmp`;
	rmSync(temp, { recursive: true, force: true });
	mkdirSync(temp, { recursive: true });
	execFileSync('tar', ['-xzf', archive, '-C', temp, `--strip-components=${stripComponents}`], { stdio: 'inherit' });
	cpSync(temp, target, { recursive: true });
	rmSync(temp, { recursive: true, force: true });
	return target;
}

function listFiles(dir) {
	const result = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			result.push(...listFiles(full));
		} else if (entry.isFile()) {
			result.push(full);
		}
	}
	return result;
}

async function buildVSCode() {
	const archive = await download(VSCODE_URL, join(cacheDir, `vscode-web-${VSCODE_VERSION}-${VSCODE_COMMIT}.tar.gz`), VSCODE_SHA256);
	const source = extract(archive, join(cacheDir, `vscode-web-${VSCODE_COMMIT}`), 1);
	const excluded = VSCODE_EXCLUDES.map(p => join(source, ...p.split('/')));
	cpSync(source, join(distDir, 'vscode'), {
		recursive: true,
		filter: path => !excluded.some(e => path === e || path.startsWith(e + sep)),
	});
}

function buildTraceVizExtension() {
	execFileSync('npm', ['run', 'package-web'], { cwd: repoDir, stdio: 'inherit', shell: process.platform === 'win32' });
	const target = join(distDir, 'extensions', 'traceviz');
	mkdirSync(join(target, 'dist', 'web'), { recursive: true });
	for (const file of ['package.json', 'LICENSE', 'README.md']) {
		cpSync(join(repoDir, file), join(target, file));
	}
	cpSync(join(repoDir, 'dist', 'web', 'extension.js'), join(target, 'dist', 'web', 'extension.js'));
	writeFileSync(join(target, 'package.nls.json'), '{}'); // avoids 404s, the workbench always asks for it
}

async function buildDemoWorkspace() {
	const target = join(distDir, 'extensions', 'demo-workspace');
	cpSync(join(demoDir, 'fs-extension'), target, { recursive: true });
	writeFileSync(join(target, 'package.nls.json'), '{}');
	const workspace = join(cacheDir, 'workspace');
	rmSync(workspace, { recursive: true, force: true });

	// MediaStore3 implementation (GPL-3.0, license text in Implementation/gpl-3.0.txt)
	const archive = await download(MEDIASTORE_URL, join(cacheDir, `MediaStore3-${MEDIASTORE_COMMIT}.tar.gz`));
	const mediastore = extract(archive, join(cacheDir, `MediaStore3-${MEDIASTORE_COMMIT}`), 1);
	cpSync(join(mediastore, 'Implementation'), join(workspace, 'Implementation'), {
		recursive: true,
		filter: path => !path.endsWith('.class'),
	});
	cpSync(join(mediastore, 'README.md'), join(workspace, 'README.md'));

	// SAD, gold standard, JSON code model (ACM) and PCM repository model from the ARDoCo benchmark (MIT);
	// the models are the inputs for ArDoCode and TransArC via the ARDoCo REST API
	const benchmarkFiles = {
		'text_2016/mediastore.txt': 'docs/mediastore.txt',
		'goldstandards/goldstandard_sad_2016-code_2016.csv': 'tracelinks/goldstandard_sad_2016-code_2016.csv',
		'model_2016/code/codeModel.acm': 'models/codeModel.acm',
		'model_2016/pcm/ms.repository': 'models/ms.repository',
	};
	for (const [source, path] of Object.entries(benchmarkFiles)) {
		const file = await download(`${BENCHMARK_URL}/${source}`, join(cacheDir, `benchmark-${BENCHMARK_COMMIT}`, ...source.split('/')));
		mkdirSync(dirname(join(workspace, path)), { recursive: true });
		cpSync(file, join(workspace, ...path.split('/')));
	}

	// Demo files (README, precomputed ArDoCode links, preloaded trace history)
	cpSync(join(demoDir, 'workspace'), workspace, { recursive: true });
	for (const csv of ['goldstandard_sad_2016-code_2016.csv', 'ardocode_mediastore.csv']) {
		cpSync(join(workspace, 'tracelinks', csv), join(workspace, '.trace-viz', csv));
	}

	// Copy to the site and write the manifest read by the file system provider. Path segments starting
	// with a dot (.trace-viz, .project, .settings) get a '_' prefix on the site, because the GitHub Pages
	// artifact upload skips hidden files.
	const files = {};
	for (const file of listFiles(workspace).sort()) {
		const path = relative(workspace, file).split(sep).join('/');
		const sitePath = path.split('/').map(segment => segment.startsWith('.') ? `_${segment}` : segment).join('/');
		cpSync(file, join(target, 'workspace', ...sitePath.split('/')));
		files[path] = sitePath === path ? statSync(file).size : [statSync(file).size, sitePath];
	}
	writeFileSync(join(target, 'workspace.json'), JSON.stringify({ mtime: Date.now(), files }));
	console.log(`Demo workspace: ${Object.keys(files).length} files`);
}

async function main() {
	rmSync(distDir, { recursive: true, force: true });
	mkdirSync(distDir, { recursive: true });
	cpSync(join(demoDir, 'site'), distDir, { recursive: true });
	await buildVSCode();
	buildTraceVizExtension();
	await buildDemoWorkspace();
	console.log(`Demo built in ${distDir}`);
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});
