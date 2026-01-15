import * as vscode from 'vscode';
import * as fs from 'fs';
import { TraceHistoryEntry } from '../types';
import { CONSTANTS_FILE_PATH_HISTORY, CONSTANTS_FILE_PATH_ARDOCO_CONFIG } from '../constants';
import { TraceVizStorageUtil } from '../utils/traceVizStorage.util';

/**
 * Registers the command to open the documentation file from trace history entry
 * @param context VS Code extension context for registering commands
 */
export function registerOpenDocumentationCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand('trace-viz.openDocumentation', async (historyId?: string) => {
        if (!historyId) return;
        const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
        if (!workspaceFolder) return;
        
        // Try to get documentation path from history entry first
        const history = TraceVizStorageUtil.readJsonFile<TraceHistoryEntry[]>(
            CONSTANTS_FILE_PATH_HISTORY,
            workspaceFolder
        ) || [];
        
        const historyEntry = history.find(entry => entry.id === historyId);
        
        if (historyEntry?.documentationPath) {
            // Use documentation path from history entry (for CSV Direct)
            if (fs.existsSync(historyEntry.documentationPath)) {
                vscode.commands.executeCommand('vscode.open', vscode.Uri.file(historyEntry.documentationPath));
                return;
            } else {
                vscode.window.showWarningMessage('Documentation file not found.');
                return;
            }
        }
        
        // Fallback to ArDoCo config (for ArDoCo-based entries)
        const config = TraceVizStorageUtil.readJsonFile<any>(CONSTANTS_FILE_PATH_ARDOCO_CONFIG, workspaceFolder);
        if (!config) {
            vscode.window.showWarningMessage('No documentation file configured.');
            return;
        }
        
        const docPath: string | undefined = config?.documentationPath;
        if (docPath && fs.existsSync(docPath)) {
            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(docPath));
        } else {
            vscode.window.showWarningMessage('Documentation file not found in ArDoCo config.');
        }
    }));
}


