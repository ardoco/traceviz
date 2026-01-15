import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ArDoCoConfig } from '../../types';
import { getArDoCoConfigWebviewHtml } from './configArDoCo.html';
import { CONSTANTS_FILE_PATH_ARDOCO_CONFIG } from '../../constants';
import { TraceVizStorageUtil } from '../../utils/traceVizStorage.util';

/**
 * Gets file picker options based on the field type
 */
function getFilePickerOptions(field: string, workspaceFolder?: vscode.WorkspaceFolder): vscode.OpenDialogOptions {
    const baseOptions: vscode.OpenDialogOptions = {
        canSelectMany: false,
        defaultUri: workspaceFolder?.uri
    };

    if (field === 'jarPath') {
        return {
            ...baseOptions,
            filters: { 'JAR files': ['jar'] },
            openLabel: 'Select JAR File'
        };
    } else if (field === 'documentationPath') {
        return {
            ...baseOptions,
            filters: { 'Text files': ['txt'] },
            openLabel: 'Select Documentation File'
        };
    } else if (field === 'architectureModelPath') {
        return {
            ...baseOptions,
            filters: { 'All files': ['*'] },
            openLabel: 'Select Architecture Model File'
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
 * Handles folder picker requests from the webview
 */
async function handlePickFolder(
    panel: vscode.WebviewPanel,
    field: string
): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const folderOptions: vscode.OpenDialogOptions = {
        canSelectMany: false,
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: 'Select Folder',
        defaultUri: workspaceFolder?.uri
    };
    
    const folderUri = await vscode.window.showOpenDialog(folderOptions);
    if (folderUri && folderUri[0]) {
        const selectedPath = folderUri[0].fsPath;
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
function handleSaveConfig(data: ArDoCoConfig): void {
    saveArDoCoConfig(data);
    vscode.window.showInformationMessage('ArDoCo configuration saved successfully!');
    vscode.commands.executeCommand('trace-viz.refreshApproach');
}

/**
 * Handles messages from the webview
 */
function createMessageHandler(panel: vscode.WebviewPanel): (message: any) => Promise<void> {
    return async (message: any) => {
        switch (message.command) {
            case 'save':
                handleSaveConfig(message.data);
                break;
            case 'cancel':
                panel.dispose();
                break;
            case 'pickFile':
                await handlePickFile(panel, message.field);
                break;
            case 'pickFolder':
                await handlePickFolder(panel, message.field);
                break;
        }
    };
}

/**
 * Registers the command to open the ArDoCo configuration webview
 * @param context VS Code extension context for registering commands
 */
export function registerArDoCoWebviewCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('trace-viz.openArDoCoWebview', () => {
        // Create and show a new webview panel
        const panel = vscode.window.createWebviewPanel(
            'ardocoConfig', // Identifies the type of the webview
            'ArDoCo Configuration', // Title of the panel displayed to the user
            vscode.ViewColumn.One, // Editor column to show the new webview panel in
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Load existing configuration
        const config = loadArDoCoConfig();
        
        // Set the webview's initial html content
        panel.webview.html = getArDoCoConfigWebviewHtml(config);

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
 * Converts all path fields in config to relative paths for display
 */
function configToDisplay(config: ArDoCoConfig, workspaceFolder?: vscode.WorkspaceFolder): ArDoCoConfig {
    if (!workspaceFolder) {
        return config;
    }
    
    return {
        ...config,
        jarPath: toRelativePath(config.jarPath, workspaceFolder),
        codePath: toRelativePath(config.codePath, workspaceFolder),
        documentationPath: toRelativePath(config.documentationPath, workspaceFolder),
        architectureModelPath: toRelativePath(config.architectureModelPath, workspaceFolder)
    };
}

/**
 * Converts all path fields in config from relative to absolute paths for storage
 */
function configToStorage(config: ArDoCoConfig, workspaceFolder?: vscode.WorkspaceFolder): ArDoCoConfig {
    if (!workspaceFolder) {
        return config;
    }
    
    return {
        ...config,
        jarPath: toAbsolutePath(config.jarPath, workspaceFolder),
        codePath: toAbsolutePath(config.codePath, workspaceFolder),
        documentationPath: toAbsolutePath(config.documentationPath, workspaceFolder),
        architectureModelPath: toAbsolutePath(config.architectureModelPath, workspaceFolder)
    };
}

function loadArDoCoConfig(): ArDoCoConfig {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        return getDefaultConfig();
    }

    const loadedConfig = TraceVizStorageUtil.readJsonFile<ArDoCoConfig>(
        CONSTANTS_FILE_PATH_ARDOCO_CONFIG,
        workspaceFolder
    );
    
    if (!loadedConfig) {
        return getDefaultConfig(workspaceFolder);
    }

    const config = { ...getDefaultConfig(workspaceFolder), ...loadedConfig };
    // If projectName is empty, set it to workspace folder name
    if (!config.projectName) {
        config.projectName = workspaceFolder.name;
    }
    // Convert paths to relative for display
    return configToDisplay(config, workspaceFolder);
}

function saveArDoCoConfig(config: ArDoCoConfig): void {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('No workspace open to save configuration.');
        return;
    }

    // Convert relative paths to absolute before saving
    const configToSave = configToStorage(config, workspaceFolder);
    
    // Save configuration
    const success = TraceVizStorageUtil.writeJsonFile(
        CONSTANTS_FILE_PATH_ARDOCO_CONFIG,
        configToSave,
        2,
        workspaceFolder
    );
    
    if (!success) {
        vscode.window.showErrorMessage('Failed to save ArDoCo configuration.');
    }
}

function getDefaultConfig(workspaceFolder?: vscode.WorkspaceFolder): ArDoCoConfig {
    return {
        restApiUrl: 'https://rest.ardoco.de',
        jarPath: '',
        projectName: workspaceFolder ? workspaceFolder.name : '',
        codePath: '',
        documentationPath: '',
        architectureModelPath: ''
    };
}
