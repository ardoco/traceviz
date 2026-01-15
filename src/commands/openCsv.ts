import * as vscode from 'vscode';
import { readHistory } from '../services/historyService';

/**
 * Registers the command to open CSV files from trace history
 * @param context VS Code extension context for registering commands
 */
export function registerOpenCsvCommand(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand('trace-viz.openCsv', async (itemOrId?: any) => {
        if (!itemOrId) return;
        // Accept either a historyId string or the tree item itself
        const historyId: string | undefined = typeof itemOrId === 'string' ? itemOrId : itemOrId?.historyId;

        // Try to resolve csvPath directly from the item's resourceUri first
        let csvPath: string | undefined = itemOrId?.resourceUri?.fsPath;

        if (!csvPath) {
            const history = readHistory();
            const item = history.find(h => (historyId ? h.id === historyId : false));
            csvPath = item?.csvPath;
        }

        if (!csvPath) {
            vscode.window.showWarningMessage('CSV path not found for this history item.');
            return;
        }

        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(csvPath));
    }));
}


