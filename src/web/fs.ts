/**
 * Browser replacement for the synchronous subset of the Node.js `fs` module that
 * TraceViz uses (aliased in esbuild.js for the web build only).
 *
 * VS Code for the Web only offers the asynchronous `vscode.workspace.fs` API. To reuse the
 * synchronous code of the desktop extension, {@link preloadWorkspace} mirrors the workspace
 * into memory when the extension activates: the directory tree of every workspace folder,
 * plus the content of all trace link files (`*.csv` and everything below `.trace-viz/`).
 * Reads are served from that mirror; writes update the mirror immediately and are written
 * through to the workspace file system asynchronously, in order.
 */
import * as vscode from 'vscode';
import * as path from './path';
import { CONSTANTS_FILE_PATH_STORAGE_DIR } from '../constants';

/** Files larger than this are not mirrored with their content */
const MAX_PRELOAD_FILE_SIZE = 10 * 1024 * 1024;
/** Upper bound for the number of mirrored entries (protects against huge workspaces) */
const MAX_ENTRIES = 50000;

interface Entry {
    isDir: boolean;
    size: number;
    mtime: number;
    data?: Uint8Array;
}

const entries = new Map<string, Entry>();
const pendingWrites = new Map<string, number>();
let writeQueue: Promise<void> = Promise.resolve();

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function key(p: string): string {
    const normalized = path.resolve(p);
    return normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function fsError(code: string, syscall: string, p: string): Error {
    const error = new Error(`${code}: ${syscall} '${p}'`) as Error & { code: string };
    error.code = code;
    return error;
}

function shouldPreloadContent(p: string, size: number): boolean {
    if (size > MAX_PRELOAD_FILE_SIZE) {
        return false;
    }
    return p.toLowerCase().endsWith('.csv') || p.split('/').includes(CONSTANTS_FILE_PATH_STORAGE_DIR);
}

function toWorkspaceUri(p: string): vscode.Uri | undefined {
    const k = key(p);
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        const root = key(folder.uri.fsPath);
        if (k === root) {
            return folder.uri;
        }
        if (k.startsWith(root === '/' ? '/' : root + '/')) {
            return vscode.Uri.joinPath(folder.uri, k.substring(root.length));
        }
    }
    return undefined;
}

function enqueueWrite(p: string, operation: (uri: vscode.Uri) => Thenable<void>): void {
    const uri = toWorkspaceUri(p);
    if (!uri) {
        return;
    }
    const k = key(p);
    pendingWrites.set(k, (pendingWrites.get(k) ?? 0) + 1);
    writeQueue = writeQueue
        .then(() => operation(uri))
        .then(undefined, error => console.error(`[TraceViz] Failed to write ${uri.toString()}:`, error))
        .then(() => {
            const remaining = (pendingWrites.get(k) ?? 1) - 1;
            if (remaining > 0) {
                pendingWrites.set(k, remaining);
            } else {
                pendingWrites.delete(k);
            }
        });
}

function ensureParents(k: string): void {
    let dir = path.dirname(k);
    while (!entries.has(dir)) {
        entries.set(dir, { isDir: true, size: 0, mtime: Date.now() });
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
}

async function mirrorFile(k: string, uri: vscode.Uri, stat: vscode.FileStat): Promise<void> {
    const entry: Entry = { isDir: false, size: stat.size, mtime: stat.mtime };
    if (shouldPreloadContent(k, stat.size)) {
        entry.data = await vscode.workspace.fs.readFile(uri);
        entry.size = entry.data.byteLength;
    }
    entries.set(k, entry);
}

async function mirrorDirectory(dirKey: string, uri: vscode.Uri): Promise<void> {
    entries.set(dirKey, { isDir: true, size: 0, mtime: Date.now() });
    if (entries.size > MAX_ENTRIES) {
        return;
    }
    const children = await vscode.workspace.fs.readDirectory(uri);
    await Promise.all(children.map(async ([name, type]) => {
        const childKey = path.join(dirKey, name);
        const childUri = vscode.Uri.joinPath(uri, name);
        try {
            if (type & vscode.FileType.Directory) {
                await mirrorDirectory(childKey, childUri);
            } else if (type & vscode.FileType.File) {
                await mirrorFile(childKey, childUri, await vscode.workspace.fs.stat(childUri));
            }
        } catch (error) {
            console.warn(`[TraceViz] Could not mirror ${childUri.toString()}:`, error);
        }
    }));
}

async function refreshFromWorkspace(uri: vscode.Uri): Promise<void> {
    const k = key(uri.fsPath);
    if (pendingWrites.has(k)) {
        return; // our own write-through; the mirror is already up to date
    }
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type & vscode.FileType.Directory) {
            await mirrorDirectory(k, uri);
        } else {
            ensureParents(k);
            await mirrorFile(k, uri, stat);
        }
    } catch {
        // deleted in the meantime
    }
}

function removeFromMirror(uri: vscode.Uri): void {
    const k = key(uri.fsPath);
    if (pendingWrites.has(k)) {
        return;
    }
    for (const existing of Array.from(entries.keys())) {
        if (existing === k || existing.startsWith(k + '/')) {
            entries.delete(existing);
        }
    }
}

/**
 * Mirrors all workspace folders into memory and keeps the mirror up to date.
 * Must complete before any other TraceViz code runs.
 * @param context Extension context used to register the file system watchers
 */
export async function preloadWorkspace(context: vscode.ExtensionContext): Promise<void> {
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        try {
            await mirrorDirectory(key(folder.uri.fsPath), folder.uri);
        } catch (error) {
            console.error(`[TraceViz] Could not read workspace folder ${folder.uri.toString()}:`, error);
        }
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '**'));
        watcher.onDidCreate(uri => refreshFromWorkspace(uri));
        watcher.onDidChange(uri => refreshFromWorkspace(uri));
        watcher.onDidDelete(uri => removeFromMirror(uri));
        context.subscriptions.push(watcher);
    }
}

export function existsSync(p: string): boolean {
    return typeof p === 'string' && p.length > 0 && entries.has(key(p));
}

export function statSync(p: string) {
    const entry = entries.get(key(p));
    if (!entry) {
        throw fsError('ENOENT', 'stat', p);
    }
    return {
        size: entry.size,
        mtimeMs: entry.mtime,
        mtime: new Date(entry.mtime),
        isFile: () => !entry.isDir,
        isDirectory: () => entry.isDir
    };
}

export function readFileSync(p: string, options?: string | { encoding?: string }): string | Uint8Array {
    const entry = entries.get(key(p));
    if (!entry || entry.isDir) {
        throw fsError(entry ? 'EISDIR' : 'ENOENT', 'open', p);
    }
    if (!entry.data) {
        throw fsError('EIO', 'read (content not available in VS Code for the Web)', p);
    }
    const encoding = typeof options === 'string' ? options : options?.encoding;
    return encoding ? decoder.decode(entry.data) : entry.data;
}

export function writeFileSync(p: string, content: string | Uint8Array): void {
    const k = key(p);
    const existing = entries.get(k);
    if (existing?.isDir) {
        throw fsError('EISDIR', 'open', p);
    }
    const data = typeof content === 'string' ? encoder.encode(content) : content;
    ensureParents(k);
    entries.set(k, { isDir: false, size: data.byteLength, mtime: Date.now(), data });
    enqueueWrite(k, uri => vscode.workspace.fs.writeFile(uri, data));
}

export function copyFileSync(source: string, target: string): void {
    const data = readFileSync(source);
    writeFileSync(target, data as Uint8Array);
}

export function mkdirSync(p: string): void {
    const k = key(p);
    if (entries.has(k)) {
        return;
    }
    ensureParents(k);
    entries.set(k, { isDir: true, size: 0, mtime: Date.now() });
    enqueueWrite(k, uri => vscode.workspace.fs.createDirectory(uri));
}

export function readdirSync(p: string, options?: { withFileTypes?: boolean }) {
    const k = key(p);
    const entry = entries.get(k);
    if (!entry || !entry.isDir) {
        throw fsError(entry ? 'ENOTDIR' : 'ENOENT', 'scandir', p);
    }
    const children: { name: string; isFile: () => boolean; isDirectory: () => boolean }[] = [];
    for (const [childKey, child] of entries) {
        if (childKey !== k && path.dirname(childKey) === k) {
            children.push({ name: path.basename(childKey), isFile: () => !child.isDir, isDirectory: () => child.isDir });
        }
    }
    return options?.withFileTypes ? children : children.map(c => c.name);
}

export function createReadStream(p: string): never {
    throw fsError('ENOTSUP', 'createReadStream (not available in VS Code for the Web)', p);
}
