import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TraceVizStorageUtil } from '../../utils/traceVizStorage.util';
import { getLissaConfigWebviewHtml, LissaConfig } from './lissaConfig.html';
import { Logger } from '../../utils/logger.util';
import { CONSTANTS_FILE_PATH_STORAGE_DIR } from '../../constants';

/**
 * Path to the LiSSA configuration file within .trace-viz
 */
const LISSA_CONFIG_FILE = 'lissa-config.json';

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
    
    if (path.isAbsolute(relativeOrAbsolutePath)) {
        return relativeOrAbsolutePath;
    }
    
    return path.resolve(workspaceFolder.uri.fsPath, relativeOrAbsolutePath);
}

/**
 * Gets the default LiSSA configuration
 */
function getDefaultConfig(): LissaConfig {
    return {
        jsonConfig: '{\n  \n}',
        jarPath: ''
    };
}

/**
 * Loads the LiSSA configuration from storage
 */
function loadLissaConfig(): LissaConfig {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        return getDefaultConfig();
    }

    const configPath = TraceVizStorageUtil.getStorageFilePath(LISSA_CONFIG_FILE, workspaceFolder);
    if (!configPath || !fs.existsSync(configPath)) {
        return getDefaultConfig();
    }

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        // Convert absolute paths to relative for display
        return {
            jsonConfig: config.jsonConfig || getDefaultConfig().jsonConfig,
            jarPath: toRelativePath(config.jarPath || '', workspaceFolder)
        };
    } catch (error) {
        Logger.errorWithStack('Failed to load LiSSA config:', error);
        return getDefaultConfig();
    }
}

/**
 * Saves the LiSSA configuration to storage
 */
function saveLissaConfig(config: LissaConfig, workspaceFolder: vscode.WorkspaceFolder): void {
    const configToSave: LissaConfig = {
        jsonConfig: config.jsonConfig,
        jarPath: toAbsolutePath(config.jarPath, workspaceFolder)
    };

    const configPath = TraceVizStorageUtil.getStorageFilePath(LISSA_CONFIG_FILE, workspaceFolder);
    if (!configPath) {
        vscode.window.showErrorMessage('Failed to get storage directory path.');
        return;
    }

    try {
        // Ensure directory exists
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2), 'utf8');
        vscode.window.showInformationMessage('LiSSA configuration saved successfully.');
        Logger.info('LiSSA configuration saved');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to save LiSSA configuration: ${error}`);
        Logger.errorWithStack('Failed to save LiSSA config:', error);
    }
}

/**
 * Handles file picker requests from the webview
 */
async function handlePickFile(
    panel: vscode.WebviewPanel,
    field: string,
    workspaceFolder: vscode.WorkspaceFolder
): Promise<void> {
    const fileOptions: vscode.OpenDialogOptions = {
        canSelectMany: false,
        filters: { 'JAR files': ['jar'] },
        openLabel: 'Select JAR File',
        defaultUri: workspaceFolder.uri
    };
    const fileUri = await vscode.window.showOpenDialog(fileOptions);
    
    if (fileUri && fileUri[0]) {
        const selectedPath = fileUri[0].fsPath;
        const displayPath = toRelativePath(selectedPath, workspaceFolder);
        panel.webview.postMessage({
            command: 'updateField',
            field: field,
            value: displayPath
        });
    }
}

/**
 * Creates a message handler for the webview
 */
function createMessageHandler(panel: vscode.WebviewPanel, workspaceFolder: vscode.WorkspaceFolder): (message: any) => Promise<void> {
    return async (message: any) => {
        switch (message.command) {
            case 'save':
                // Validate JSON before saving
                try {
                    JSON.parse(message.data.jsonConfig);
                } catch (error) {
                    vscode.window.showErrorMessage(`Invalid JSON configuration: ${error}`);
                    return;
                }
                saveLissaConfig(message.data, workspaceFolder);
                panel.dispose();
                break;
            case 'cancel':
                panel.dispose();
                break;
            case 'pickFile':
                await handlePickFile(panel, message.field, workspaceFolder);
                break;
            case 'error':
                vscode.window.showErrorMessage(message.message || 'An error occurred');
                break;
        }
    };
}

/**
 * Registers the LiSSA webview command
 * @param context VS Code extension context for registering commands
 */
export function registerLissaWebviewCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('trace-viz.openLissaWebview', () => {
        const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('Please open a workspace to configure LiSSA.');
            return;
        }

        // Create and show a new webview panel
        const panel = vscode.window.createWebviewPanel(
            'lissaConfig', // Identifies the type of the webview
            'LiSSA Configuration', // Title of the panel displayed to the user
            vscode.ViewColumn.One, // Editor column to show the new webview panel in
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Load existing configuration
        const config = loadLissaConfig();
        
        // Set the webview's initial html content
        panel.webview.html = getLissaConfigWebviewHtml(config);

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            createMessageHandler(panel, workspaceFolder),
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);
}

