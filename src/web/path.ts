/**
 * Browser replacement for the Node.js `path` module (aliased in esbuild.js).
 *
 * Workspace paths in VS Code for the Web are POSIX paths, but `Uri.fsPath` uses
 * backslashes when the browser runs on Windows. All inputs are therefore normalized
 * to forward slashes before they are passed to path-browserify, and `resolve` uses
 * `/` as working directory because there is no `process.cwd()` in the browser.
 */
import pathBrowserify from 'path-browserify';

const toPosix = (p: string): string => p.replace(/\\/g, '/');

export const sep = '/';
export const delimiter = ':';
export const posix = pathBrowserify;

export function normalize(p: string): string {
    return pathBrowserify.normalize(toPosix(p));
}

export function join(...paths: string[]): string {
    return pathBrowserify.join(...paths.map(toPosix));
}

export function resolve(...paths: string[]): string {
    return pathBrowserify.resolve('/', ...paths.map(toPosix));
}

export function relative(from: string, to: string): string {
    return pathBrowserify.relative(resolve(from), resolve(to));
}

export function isAbsolute(p: string): boolean {
    return pathBrowserify.isAbsolute(toPosix(p));
}

export function dirname(p: string): string {
    return pathBrowserify.dirname(toPosix(p));
}

export function basename(p: string, ext?: string): string {
    return pathBrowserify.basename(toPosix(p), ext);
}

export function extname(p: string): string {
    return pathBrowserify.extname(toPosix(p));
}

export function parse(p: string): ReturnType<typeof pathBrowserify.parse> {
    return pathBrowserify.parse(toPosix(p));
}

export function format(p: Parameters<typeof pathBrowserify.format>[0]): string {
    return pathBrowserify.format(p);
}
