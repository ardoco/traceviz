import * as vscode from 'vscode';
import * as path from 'path';
import { ArDoCoConfig } from '../../types';
import { getArDoCoConfigWebviewHtml } from './configArDoCo.html';
import { CONSTANTS_FILE_PATH_ARDOCO_CONFIG, CONSTANTS_FILE_PATH_ARDOCO_CODE_MODEL } from '../../constants';
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
    } else if (field === 'codeModelPath') {
        return {
            ...baseOptions,
            filters: { 'JSON code model': ['acm', 'json'] },
            openLabel: 'Select Code Model File'
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
    vscode.window.showInformationMessage('ARDoCo configuration saved successfully!');
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
            'ARDoCo Configuration', // Title of the panel displayed to the user
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
        architectureModelPath: toRelativePath(config.architectureModelPath, workspaceFolder),
        codeModelPath: toRelativePath(config.codeModelPath ?? '', workspaceFolder)
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
        architectureModelPath: toAbsolutePath(config.architectureModelPath, workspaceFolder),
        codeModelPath: toAbsolutePath(config.codeModelPath ?? '', workspaceFolder)
    };
}

/**
 * Reads the ARDoCo configuration of a workspace, with defaults for missing fields
 * and all paths resolved against the workspace folder (relative paths are allowed in the file)
 * @param workspaceFolder Workspace folder whose .trace-viz/ardoco-config.json is read
 * @returns The configuration with absolute paths, or undefined if there is no configuration file
 */
export function readArDoCoConfig(workspaceFolder: vscode.WorkspaceFolder): ArDoCoConfig | undefined {
    const loadedConfig = TraceVizStorageUtil.readJsonFile<Partial<ArDoCoConfig>>(
        CONSTANTS_FILE_PATH_ARDOCO_CONFIG,
        workspaceFolder
    );
    if (!loadedConfig) {
        return undefined;
    }
    const config = { ...getDefaultConfig(workspaceFolder), ...loadedConfig };
    // If projectName is empty, set it to workspace folder name
    if (!config.projectName) {
        config.projectName = workspaceFolder.name;
    }
    return configToStorage(config, workspaceFolder);
}

/**
 * Gets the code model sent to the ARDoCo REST API: the configured JSON code model file,
 * or else the code model generated by the Code Model Extractor into .trace-viz/
 * @param config ARDoCo configuration with absolute paths
 * @param workspaceFolder Workspace folder of the configuration
 * @returns Absolute path of the code model file (it may not exist)
 */
export function getCodeModelPath(config: ArDoCoConfig, workspaceFolder: vscode.WorkspaceFolder): string | undefined {
    if (config.codeModelPath) {
        return config.codeModelPath;
    }
    return TraceVizStorageUtil.getStorageFilePath(CONSTANTS_FILE_PATH_ARDOCO_CODE_MODEL, workspaceFolder);
}

/**
 * Gets the format of the configured architecture model for the ARDoCo REST API
 * @param config ARDoCo configuration
 * @returns The configured format, or PCM for .repository files and UML otherwise
 */
export function getArchitectureModelFormat(config: ArDoCoConfig): string {
    if (config.architectureModelFormat) {
        return config.architectureModelFormat;
    }
    return config.architectureModelPath.toLowerCase().endsWith('.repository') ? 'PCM' : 'UML';
}

function loadArDoCoConfig(): ArDoCoConfig {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        return getDefaultConfig();
    }
    const config = readArDoCoConfig(workspaceFolder) ?? getDefaultConfig(workspaceFolder);
    // Convert paths to relative for display
    return configToDisplay(config, workspaceFolder);
}

/**
 * Saves the ARDoCo configuration of the first workspace folder.
 * Fields not contained in the given configuration keep their stored values.
 * @param config Configuration to save; paths may be relative to the workspace folder
 */
export function saveArDoCoConfig(config: Partial<ArDoCoConfig>): void {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('No workspace open to save configuration.');
        return;
    }

    const stored = TraceVizStorageUtil.readJsonFile<Partial<ArDoCoConfig>>(CONSTANTS_FILE_PATH_ARDOCO_CONFIG, workspaceFolder);
    // Convert relative paths to absolute before saving
    const configToSave = configToStorage({ ...getDefaultConfig(workspaceFolder), ...stored, ...config }, workspaceFolder);
    
    // Save configuration
    const success = TraceVizStorageUtil.writeJsonFile(
        CONSTANTS_FILE_PATH_ARDOCO_CONFIG,
        configToSave,
        2,
        workspaceFolder
    );
    
    if (!success) {
        vscode.window.showErrorMessage('Failed to save ARDoCo configuration.');
    }
}

export function getDefaultConfig(workspaceFolder?: vscode.WorkspaceFolder): ArDoCoConfig {
    return {
        restApiUrl: 'https://rest.ardoco.de',
        jarPath: '',
        projectName: workspaceFolder ? workspaceFolder.name : '',
        codePath: '',
        documentationPath: '',
        architectureModelPath: '',
        codeModelPath: ''
    };
}
