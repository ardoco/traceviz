// @ts-check
/*
 * File system provider for the TraceViz web demo.
 *
 * Serves the demo workspace under `tracevizdemo:/mediastore` from the static files next to this
 * extension (`workspace/`, listed in `workspace.json` by demo/build.mjs). File contents are
 * fetched on first read. All changes (e.g. TraceViz writing `.trace-viz/history.json`) are kept
 * in memory only, so reloading the page restores the original demo state.
 */
const vscode = require('vscode');

const SCHEME = 'tracevizdemo';
const ROOT = '/mediastore';
const SAD_PATH = `${ROOT}/docs/mediastore.txt`;

/**
 * @typedef {{ type: vscode.FileType, ctime: number, mtime: number, size: number, data?: Uint8Array, remote?: string }} Entry
 */

class DemoFileSystemProvider {
	/**
	 * @param {vscode.Uri} extensionUri location of this extension on the site
	 */
	constructor(extensionUri) {
		this.manifestUri = vscode.Uri.joinPath(extensionUri, 'workspace.json');
		this.contentBase = vscode.Uri.joinPath(extensionUri, 'workspace');
		/** @type {Map<string, Entry>} */
		this.entries = new Map();
		this.emitter = new vscode.EventEmitter();
		this.onDidChangeFile = this.emitter.event;
		this.ready = this.load();
	}

	async load() {
		const response = await fetch(this.manifestUri.toString());
		if (!response.ok) {
			throw new Error(`Could not load the demo workspace manifest (${response.status})`);
		}
		// files: workspace path -> size, or [size, path on the site] if the file is stored under another name
		/** @type {{ mtime: number, files: Record<string, number | [number, string]> }} */
		const manifest = await response.json();
		const time = manifest.mtime;
		this.entries.set('/', { type: vscode.FileType.Directory, ctime: time, mtime: time, size: 0 });
		this.entries.set(ROOT, { type: vscode.FileType.Directory, ctime: time, mtime: time, size: 0 });
		for (const [relativePath, info] of Object.entries(manifest.files)) {
			const [size, remote] = Array.isArray(info) ? info : [info, relativePath];
			const path = `${ROOT}/${relativePath}`;
			this.ensureParents(path, time);
			this.entries.set(path, { type: vscode.FileType.File, ctime: time, mtime: time, size, remote });
		}
	}

	/**
	 * @param {string} path
	 * @param {number} time
	 */
	ensureParents(path, time) {
		for (let dir = parentOf(path); !this.entries.has(dir); dir = parentOf(dir)) {
			this.entries.set(dir, { type: vscode.FileType.Directory, ctime: time, mtime: time, size: 0 });
		}
	}

	/**
	 * @param {vscode.Uri} uri
	 * @returns {Promise<Entry>}
	 */
	async lookup(uri) {
		await this.ready;
		const entry = this.entries.get(normalize(uri.path));
		if (!entry) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
		return entry;
	}

	watch() {
		return new vscode.Disposable(() => { });
	}

	/** @param {vscode.Uri} uri */
	async stat(uri) {
		const { type, ctime, mtime, size } = await this.lookup(uri);
		return { type, ctime, mtime, size };
	}

	/** @param {vscode.Uri} uri */
	async readDirectory(uri) {
		const entry = await this.lookup(uri);
		if (entry.type !== vscode.FileType.Directory) {
			throw vscode.FileSystemError.FileNotADirectory(uri);
		}
		const dir = normalize(uri.path);
		/** @type {[string, vscode.FileType][]} */
		const result = [];
		for (const [path, child] of this.entries) {
			if (path !== dir && parentOf(path) === dir) {
				result.push([path.substring(path.lastIndexOf('/') + 1), child.type]);
			}
		}
		return result;
	}

	/** @param {vscode.Uri} uri */
	async readFile(uri) {
		const entry = await this.lookup(uri);
		if (entry.type !== vscode.FileType.File) {
			throw vscode.FileSystemError.FileIsADirectory(uri);
		}
		if (!entry.data && entry.remote !== undefined) {
			const target = vscode.Uri.joinPath(this.contentBase, ...entry.remote.split('/'));
			const response = await fetch(target.toString());
			if (!response.ok) {
				throw vscode.FileSystemError.Unavailable(uri);
			}
			entry.data = new Uint8Array(await response.arrayBuffer());
			entry.size = entry.data.byteLength;
		}
		return entry.data ?? new Uint8Array();
	}

	/**
	 * @param {vscode.Uri} uri
	 * @param {Uint8Array} content
	 * @param {{ create: boolean, overwrite: boolean }} options
	 */
	async writeFile(uri, content, options) {
		await this.ready;
		const path = normalize(uri.path);
		const existing = this.entries.get(path);
		if (existing?.type === vscode.FileType.Directory) {
			throw vscode.FileSystemError.FileIsADirectory(uri);
		}
		if (!existing && !options.create) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
		if (existing && options.create && !options.overwrite) {
			throw vscode.FileSystemError.FileExists(uri);
		}
		if (!this.entries.has(parentOf(path))) {
			throw vscode.FileSystemError.FileNotFound(uri.with({ path: parentOf(path) }));
		}
		const now = Date.now();
		this.entries.set(path, { type: vscode.FileType.File, ctime: existing?.ctime ?? now, mtime: now, size: content.byteLength, data: content });
		this.fire(existing ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created, uri);
	}

	/** @param {vscode.Uri} uri */
	async createDirectory(uri) {
		await this.ready;
		const path = normalize(uri.path);
		if (this.entries.has(path)) {
			throw vscode.FileSystemError.FileExists(uri);
		}
		if (!this.entries.has(parentOf(path))) {
			throw vscode.FileSystemError.FileNotFound(uri.with({ path: parentOf(path) }));
		}
		const now = Date.now();
		this.entries.set(path, { type: vscode.FileType.Directory, ctime: now, mtime: now, size: 0 });
		this.fire(vscode.FileChangeType.Created, uri);
	}

	/**
	 * @param {vscode.Uri} uri
	 * @param {{ recursive: boolean }} options
	 */
	async delete(uri, options) {
		const entry = await this.lookup(uri);
		const path = normalize(uri.path);
		const descendants = Array.from(this.entries.keys()).filter(p => p.startsWith(path + '/'));
		if (entry.type === vscode.FileType.Directory && descendants.length > 0 && !options.recursive) {
			throw vscode.FileSystemError.NoPermissions('Directory is not empty');
		}
		for (const p of [path, ...descendants]) {
			this.entries.delete(p);
		}
		this.fire(vscode.FileChangeType.Deleted, uri);
	}

	/**
	 * @param {vscode.Uri} oldUri
	 * @param {vscode.Uri} newUri
	 * @param {{ overwrite: boolean }} options
	 */
	async rename(oldUri, newUri, options) {
		await this.lookup(oldUri);
		const from = normalize(oldUri.path);
		const to = normalize(newUri.path);
		if (this.entries.has(to) && !options.overwrite) {
			throw vscode.FileSystemError.FileExists(newUri);
		}
		if (!this.entries.has(parentOf(to))) {
			throw vscode.FileSystemError.FileNotFound(newUri.with({ path: parentOf(to) }));
		}
		for (const p of Array.from(this.entries.keys())) {
			if (p === from || p.startsWith(from + '/')) {
				const entry = /** @type {Entry} */ (this.entries.get(p));
				if (entry.remote !== undefined && !entry.data) {
					await this.readFile(oldUri.with({ path: p }));
				}
				this.entries.delete(p);
				this.entries.set(to + p.substring(from.length), entry);
			}
		}
		this.fire(vscode.FileChangeType.Deleted, oldUri);
		this.fire(vscode.FileChangeType.Created, newUri);
	}

	/**
	 * File search for Quick Open (proposed API `fileSearchProvider`, enabled in site/main.js).
	 * Returns all files; the workbench does the fuzzy matching.
	 * @param {any} _query
	 * @param {{ folder: vscode.Uri, maxResults?: number }} options
	 */
	async provideFileSearchResults(_query, options) {
		await this.ready;
		const folder = normalize(options.folder.path);
		const result = [];
		for (const [path, entry] of this.entries) {
			if (entry.type === vscode.FileType.File && path.startsWith(folder + '/')) {
				result.push(options.folder.with({ path }));
				if (options.maxResults !== undefined && result.length >= options.maxResults) {
					break;
				}
			}
		}
		return result;
	}

	/**
	 * @param {vscode.FileChangeType} type
	 * @param {vscode.Uri} uri
	 */
	fire(type, uri) {
		this.emitter.fire([{ type, uri }]);
	}
}

/** @param {string} path */
function normalize(path) {
	return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** @param {string} path */
function parentOf(path) {
	const index = path.lastIndexOf('/');
	return index <= 0 ? '/' : path.substring(0, index);
}

/** Shows the TraceViz sidebar and opens the architecture documentation. */
async function openDemoLayout() {
	await vscode.commands.executeCommand('workbench.view.extension.traceViz');
	const document = await vscode.workspace.openTextDocument(vscode.Uri.from({ scheme: SCHEME, path: SAD_PATH }));
	await vscode.window.showTextDocument(document, { preview: false });
}

/** @param {vscode.ExtensionContext} context */
exports.activate = function (context) {
	const provider = new DemoFileSystemProvider(context.extensionUri);
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider(SCHEME, provider, { isCaseSensitive: true }));
	// @ts-ignore proposed API
	context.subscriptions.push(vscode.workspace.registerFileSearchProvider(SCHEME, provider));
	provider.ready.then(() => setTimeout(() => openDemoLayout().then(undefined, error => console.error('[TraceViz demo]', error)), 0));
};

exports.deactivate = function () { };
