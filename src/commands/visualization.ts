import * as vscode from 'vscode';
import { showVisualization, hideVisualization, cycleVisualizationColor, readHistory, writeHistory } from '../services/historyService';
import * as fs from 'fs';
import * as path from 'path';
import { convert, writeTextFile } from '../traceabilityApproach/ardoco/convert';
import { TraceVizStorageUtil } from '../utils/traceVizStorage.util';

/**
 * Registers visualization-related commands (show, hide, cycle color, compress CSV)
 * @param context VS Code extension context for registering commands
 */
export function registerVisualizationCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand('trace-viz.showVisualization', (itemOrId: any) => {
        const historyId = typeof itemOrId === 'string' ? itemOrId : itemOrId?.historyId;
        if (!historyId) {return;}
        showVisualization(historyId);
        vscode.commands.executeCommand('trace-viz.refreshHistory');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('trace-viz.hideVisualization', (itemOrId: any) => {
        const historyId = typeof itemOrId === 'string' ? itemOrId : itemOrId?.historyId;
        if (!historyId) {return;}
        hideVisualization(historyId);
        vscode.commands.executeCommand('trace-viz.refreshHistory');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('trace-viz.cycleVisualizationColor', (itemOrId: any) => {
        const historyId = typeof itemOrId === 'string' ? itemOrId : itemOrId?.historyId;
        if (!historyId) {return;}
        cycleVisualizationColor(historyId);
        vscode.commands.executeCommand('trace-viz.refreshHistory');
    }));

    // Compress a SAD-Code CSV by grouping directories and computing coverage percentages
    context.subscriptions.push(vscode.commands.registerCommand('trace-viz.compressHistoryCsv', async (itemOrId: any) => {
        const historyId = typeof itemOrId === 'string' ? itemOrId : itemOrId?.historyId;
        if (!historyId) {return;}
        try {
            const history = readHistory();
            const entry = history.find(h => h.id === historyId);
            if (!entry || !entry.csvPath || !fs.existsSync(entry.csvPath)) {
                vscode.window.showWarningMessage('CSV not found for this history item.');
                return;
            }
            const content = fs.readFileSync(entry.csvPath, 'utf8');
            const compressed = convert({ type: 'CSV_COMPRESS_BY_DIRECTORY', input: content });
            const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
            if (!workspaceFolder) {return;}
            const baseName = path.basename(entry.csvPath, path.extname(entry.csvPath));
            const outFile = TraceVizStorageUtil.getStorageFilePath(
                `${baseName}.compressed.csv`,
                workspaceFolder
            );
            if (!outFile) {
                vscode.window.showErrorMessage('Failed to get storage directory path.');
                return;
            }
            writeTextFile(outFile, compressed);

            // Append a new history entry for the compressed file
            const newEntry = { ...entry };
            newEntry.id = `${entry.id}-compressed`;
            newEntry.originalName = entry.originalName ? `${entry.originalName} (compressed)` : `${baseName}.compressed.csv`;
            newEntry.csvPath = outFile;
            newEntry.status = 'completed';
            newEntry.active = false;
            history.unshift(newEntry);
            writeHistory(history);
            vscode.commands.executeCommand('trace-viz.refreshHistory');
            vscode.window.showInformationMessage('Trace links compressed by directory.');
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to compress trace links: ${err?.message ?? String(err)}`);
        }
    }));
}


