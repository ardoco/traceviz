import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TraceHistoryEntry } from '../../types';
import { CONSTANTS_FILE_PATH_HISTORY, CONSTANTS_NUMBER_JSON_INDENT } from '../../constants';
import { TraceVizStorageUtil } from '../../utils/traceVizStorage.util';
import { getCsvDirectConfigWebviewHtml, CsvDirectConfig } from './csvDirectConfig.html';

/**
 * Converts an absolute path to a relative path if it's within the workspace folder
 */
function toRelativePath(absolutePath: string, workspaceFolder?: vscode.WorkspaceFolder): string {
    if (!absolutePath || !workspaceFolder) {
        return absolutePath;
    }
    
    const workspacePath = workspaceFolder.uri.fsPath;
    const normalizedAbsolute = path.normalize(absolutePath);
    const normalizedWorkspace = path.normalize(workspacePath);
    
    // Check if the path is within the workspace
    if (normalizedAbsolute.startsWith(normalizedWorkspace + path.sep) || normalizedAbsolute === normalizedWorkspace) {
        const relativePath = path.relative(normalizedWorkspace, normalizedAbsolute);
        return relativePath || '.';
    }
    
    return absolutePath;
}

/**
 * Converts a relative path to an absolute path if it's relative, otherwise returns as-is
 */
function toAbsolutePath(relativeOrAbsolutePath: string, workspaceFolder?: vscode.WorkspaceFolder): string {
    if (!relativeOrAbsolutePath || !workspaceFolder) {
        return relativeOrAbsolutePath;
    }
    
    // If it's already an absolute path (starts with / on Unix or C:\ on Windows), return as-is
    if (path.isAbsolute(relativeOrAbsolutePath)) {
        return relativeOrAbsolutePath;
    }
    
    // Convert relative path to absolute
    return path.resolve(workspaceFolder.uri.fsPath, relativeOrAbsolutePath);
}

/**
 * Gets file picker options based on the field type
 */
function getFilePickerOptions(field: string, workspaceFolder?: vscode.WorkspaceFolder): vscode.OpenDialogOptions {
    const baseOptions: vscode.OpenDialogOptions = {
        canSelectMany: false,
        defaultUri: workspaceFolder?.uri
    };

    if (field === 'csvPath') {
        return {
            ...baseOptions,
            filters: { 'CSV files': ['csv'] },
            openLabel: 'Select CSV File'
        };
    } else if (field === 'documentationPath') {
        return {
            ...baseOptions,
            filters: { 'Text files': ['txt'] },
            openLabel: 'Select Documentation File'
        };
    } else {
        return {
            ...baseOptions,
            filters: { 'All files': ['*'] },
            openLabel: 'Select File'
        };
    }
}

/**
 * Handles file picker requests from the webview
 */
async function handlePickFile(
    panel: vscode.WebviewPanel,
    field: string
): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const fileOptions = getFilePickerOptions(field, workspaceFolder);
    const fileUri = await vscode.window.showOpenDialog(fileOptions);
    
    if (fileUri && fileUri[0]) {
        const selectedPath = fileUri[0].fsPath;
        const displayPath = workspaceFolder ? toRelativePath(selectedPath, workspaceFolder) : selectedPath;
        panel.webview.postMessage({
            command: 'updateField',
            field: field,
            value: displayPath
        });
    }
}

/**
 * Handles save command from the webview
 */
function handleSaveConfig(data: CsvDirectConfig): void {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('No workspace open to save configuration.');
        return;
    }

    // Convert relative paths to absolute
    const csvPath = toAbsolutePath(data.csvPath, workspaceFolder);
    const documentationPath = toAbsolutePath(data.documentationPath, workspaceFolder);

    // Validate files exist
    if (!fs.existsSync(csvPath)) {
        vscode.window.showErrorMessage(`CSV file not found: ${csvPath}`);
        return;
    }

    if (!fs.existsSync(documentationPath)) {
        vscode.window.showErrorMessage(`Documentation file not found: ${documentationPath}`);
        return;
    }

    try {
        // Generate unique filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const originalName = path.basename(csvPath);
        const fileName = `${timestamp}_${originalName}`;
        const targetPath = TraceVizStorageUtil.getStorageFilePath(fileName, workspaceFolder);
        
        if (!targetPath) {
            vscode.window.showErrorMessage('Failed to get storage directory path.');
            return;
        }

        // Copy CSV file to workspace storage
        fs.copyFileSync(csvPath, targetPath);

        // Create history entry
        const entry: TraceHistoryEntry = {
            id: timestamp,
            timestamp: new Date().toLocaleString("de-DE", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
            }),
            approach: 'CSV Direct',
            csvPath: targetPath,
            originalName: originalName,
            documentationPath: documentationPath,
            status: 'completed',
            active: false,
            color: 'blue'
        };

        // Save to history file
        let history = TraceVizStorageUtil.readJsonFile<TraceHistoryEntry[]>(
            CONSTANTS_FILE_PATH_HISTORY,
            workspaceFolder
        ) || [];
        history.unshift(entry); // Add to beginning
        TraceVizStorageUtil.writeJsonFile(
            CONSTANTS_FILE_PATH_HISTORY,
            history,
            CONSTANTS_NUMBER_JSON_INDENT,
            workspaceFolder
        );

        vscode.window.showInformationMessage(`CSV file saved: ${originalName}`);
        vscode.commands.executeCommand('trace-viz.refreshHistory');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to save CSV file: ${error}`);
    }
}

/**
 * Handles messages from the webview
 */
function createMessageHandler(panel: vscode.WebviewPanel): (message: any) => Promise<void> {
    return async (message: any) => {
        switch (message.command) {
            case 'save':
                handleSaveConfig(message.data);
                panel.dispose();
                break;
            case 'cancel':
                panel.dispose();
                break;
            case 'pickFile':
                await handlePickFile(panel, message.field);
                break;
        }
    };
}

/**
 * Gets default CSV Direct configuration
 */
function getDefaultConfig(): CsvDirectConfig {
    return {
        csvPath: '',
        documentationPath: ''
    };
}

/**
 * Registers the CSV Direct command for importing CSV trace link files directly
 * @param context VS Code extension context for registering commands
 */
export function registerCsvDirectCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('trace-viz.csvDirect', () => {
        // Check if workspace is open
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('Please open a workspace to use CSV Direct.');
            return;
        }

        // Create and show a new webview panel
        const panel = vscode.window.createWebviewPanel(
            'csvDirectConfig', // Identifies the type of the webview
            'CSV Direct Configuration', // Title of the panel displayed to the user
            vscode.ViewColumn.One, // Editor column to show the new webview panel in
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Load default configuration
        const config = getDefaultConfig();
        
        // Set the webview's initial html content
        panel.webview.html = getCsvDirectConfigWebviewHtml(config);

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            createMessageHandler(panel),
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);
}

/**
 * Reads trace history entries from the workspace
 * @param workspaceFolder Workspace folder to read history from
 * @returns Array of trace history entries, or empty array if file doesn't exist or parsing fails
 */
export function getTraceHistory(workspaceFolder: vscode.WorkspaceFolder): TraceHistoryEntry[] {
    return TraceVizStorageUtil.readJsonFile<TraceHistoryEntry[]>(
        CONSTANTS_FILE_PATH_HISTORY,
        workspaceFolder
    ) || [];
}
