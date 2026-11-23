import * as vscode from 'vscode';
import * as path from 'path';
import { ArDoCoConfig } from '../../types';
import { TraceVizStorageUtil } from '../../utils/traceVizStorage.util';
import { toUri } from '../../utils/uri.util';
import { getDefaultConfig, readArDoCoConfig, saveArDoCoConfig } from './configArDoCo';
import {
    CONSTANTS_COMMAND_ARDOCO_CONFIGURE_QUICK,
    CONSTANTS_COMMAND_ARDOCO_SELECT_CODE_MODEL,
    CONSTANTS_COMMAND_REFRESH_APPROACH
} from '../../constants';

/** Configuration fields that hold a workspace file */
type FileField = 'documentationPath' | 'codeModelPath' | 'architectureModelPath';

const FILE_FIELDS: Record<FileField, { label: string; filters: Record<string, string[]>; optional: boolean }> = {
    documentationPath: { label: 'Documentation File', filters: { 'Text files': ['txt'] }, optional: false },
    codeModelPath: { label: 'Code Model File', filters: { 'JSON code model': ['acm', 'json'] }, optional: true },
    architectureModelPath: { label: 'Architecture Model File', filters: { 'Architecture model (PCM, UML)': ['repository', 'uml'], 'All files': ['*'] }, optional: true }
};

interface FieldItem extends vscode.QuickPickItem {
    field?: 'restApiUrl' | 'projectName' | FileField;
}

function currentConfig(workspaceFolder: vscode.WorkspaceFolder): ArDoCoConfig {
    return readArDoCoConfig(workspaceFolder) ?? getDefaultConfig(workspaceFolder);
}

function displayPath(filePath: string | undefined, workspaceFolder: vscode.WorkspaceFolder): string {
    if (!filePath) {
        return 'not set';
    }
    const relative = path.relative(workspaceFolder.uri.fsPath, filePath);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : filePath;
}

function save(update: Partial<ArDoCoConfig>): void {
    saveArDoCoConfig(update);
    vscode.commands.executeCommand(CONSTANTS_COMMAND_REFRESH_APPROACH);
}

/**
 * Lets the user pick a workspace file for a configuration field and saves it
 * @returns True if the configuration was changed
 */
async function pickFile(field: FileField, workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
    const { label, filters, optional } = FILE_FIELDS[field];
    const current = currentConfig(workspaceFolder)[field];
    if (optional && current) {
        const action = await vscode.window.showQuickPick(['Select File…', 'Remove'], { title: label, placeHolder: displayPath(current, workspaceFolder) });
        if (action === 'Remove') {
            save({ [field]: '' });
            return true;
        }
        if (!action) {
            return false;
        }
    }
    const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFiles: true,
        canSelectFolders: false,
        defaultUri: current ? toUri(path.dirname(current)) : workspaceFolder.uri,
        filters,
        openLabel: `Select ${label}`,
        title: label
    });
    if (!uris || uris.length === 0) {
        return false;
    }
    save({ [field]: uris[0].fsPath });
    return true;
}

/**
 * Lets the user select an existing JSON code model (ACM) that is sent to the ARDoCo REST API
 */
export async function selectArDoCoCodeModel(): Promise<void> {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace open to configure ARDoCo.');
        return;
    }
    await pickFile('codeModelPath', workspaceFolder);
}

/**
 * Edits the ARDoCo configuration with quick picks and input boxes instead of the webview.
 * Every change is saved immediately; Escape closes the menu.
 */
export async function configureArDoCoQuick(): Promise<void> {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace open to configure ARDoCo.');
        return;
    }

    for (;;) {
        const config = currentConfig(workspaceFolder);
        const items: FieldItem[] = [
            { field: 'restApiUrl', label: 'REST API URL', description: config.restApiUrl || 'not set' },
            { field: 'projectName', label: 'Project Name', description: config.projectName || 'not set' },
            ...(Object.keys(FILE_FIELDS) as FileField[]).map(field => ({
                field,
                label: FILE_FIELDS[field].label,
                description: displayPath(config[field], workspaceFolder)
            })),
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: 'Done' }
        ];
        const pick = await vscode.window.showQuickPick(items, {
            title: 'Configure ARDoCo',
            placeHolder: 'Select a setting to change (changes are saved immediately)',
            ignoreFocusOut: true
        });
        if (!pick?.field) {
            return;
        }

        if (pick.field === 'restApiUrl' || pick.field === 'projectName') {
            const isUrl = pick.field === 'restApiUrl';
            const value = await vscode.window.showInputBox({
                title: pick.label,
                value: config[pick.field],
                prompt: isUrl ? 'URL of the ARDoCo REST API, e.g. https://rest.ardoco.de' : 'Name of the project sent to the ARDoCo REST API',
                ignoreFocusOut: true,
                validateInput: input => {
                    if (!input.trim()) {
                        return `${pick.label} must not be empty`;
                    }
                    return isUrl && !/^https?:\/\/\S+$/.test(input.trim()) ? 'Enter an http(s) URL' : undefined;
                }
            });
            if (value !== undefined) {
                save({ [pick.field]: value.trim() });
            }
        } else {
            await pickFile(pick.field, workspaceFolder);
        }
    }
}

/**
 * Registers the commands that configure ARDoCo without the webview
 * @param context VS Code extension context for registering commands
 */
export function registerArDoCoQuickConfigCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(CONSTANTS_COMMAND_ARDOCO_CONFIGURE_QUICK, configureArDoCoQuick),
        vscode.commands.registerCommand(CONSTANTS_COMMAND_ARDOCO_SELECT_CODE_MODEL, selectArDoCoCodeModel)
    );
}
