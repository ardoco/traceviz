import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Service for resolving and opening code paths
 */
export class PathResolverService {
    /**
     * Resolves the type of a code path (file or directory)
     * @param codeID Code path to resolve (can be relative or absolute)
     * @returns Object with exists flag and isDir flag
     */
    static resolvePathType(codeID: string): { exists: boolean; isDir: boolean } {
        const ws = vscode.workspace.workspaceFolders;
        if (ws && ws.length > 0) {
            for (const folder of ws) {
                const abs = path.join(folder.uri.fsPath, codeID);
                if (fs.existsSync(abs)) {
                    try {
                        const stat = fs.statSync(abs);
                        return { exists: true, isDir: stat.isDirectory() };
                    } catch {
                        // ignore
                    }
                }
            }
        }
        // Heuristic when not resolvable: treat paths without extension or ending with '/' as directories
        const looksLikeDir = /\/$/.test(codeID) || !/\.[a-zA-Z0-9]+$/.test(path.basename(codeID));
        return { exists: false, isDir: looksLikeDir };
    }

    /**
     * Opens a code path in VS Code (file or directory)
     * @param codeID Code path to open (can be relative or absolute)
     */
    static async openCodePath(codeID: string): Promise<void> {
        const ws = vscode.workspace.workspaceFolders;
        if (!ws || ws.length === 0) {
            vscode.window.showErrorMessage('No workspace open');
            return;
        }
        // Try to find a matching absolute path
        for (const folder of ws) {
            const abs = path.join(folder.uri.fsPath, codeID);
            if (fs.existsSync(abs)) {
                const stat = fs.statSync(abs);
                if (stat.isDirectory()) {
                    await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(abs));
                } else {
                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
                    await vscode.window.showTextDocument(doc);
                }
                return;
            }
        }
        vscode.window.showWarningMessage(`Could not resolve path: ${codeID}`);
    }
}

