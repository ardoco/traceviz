import * as vscode from 'vscode';

/**
 * Converts a file system path (as produced by `Uri.fsPath`) back to a URI.
 * Paths inside a workspace folder that is not backed by the local file system
 * (e.g. VS Code for the Web) keep the scheme of that folder; all other paths
 * are treated as local files, as before.
 * @param fsPath File system path to convert
 * @returns URI pointing to the given path
 */
export function toUri(fsPath: string): vscode.Uri {
    const normalized = fsPath.replace(/\\/g, '/');
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        if (folder.uri.scheme === 'file') {
            continue;
        }
        const root = folder.uri.fsPath.replace(/\\/g, '/');
        if (normalized === root || normalized.startsWith(root.endsWith('/') ? root : root + '/')) {
            return vscode.Uri.joinPath(folder.uri, normalized.substring(root.length));
        }
    }
    return vscode.Uri.file(fsPath);
}
