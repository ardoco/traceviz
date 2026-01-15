import * as vscode from 'vscode';

const SETTING_SECTION = 'trace-viz';
const SETTING_KEY = 'codeModelExtractorJar';

/**
 * Registers the command to browse and select the Code Model Extractor JAR file
 * @param context VS Code extension context for registering commands
 */
export function registerBrowseCodeModelExtractorJarCommand(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('trace-viz.browseCodeModelExtractorJar', async () => {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            filters: { 'JAR files': ['jar'] },
            openLabel: 'Select JAR'
        };
        const selected = await vscode.window.showOpenDialog(options);
        if (!selected || selected.length === 0) {
            return;
        }
        const uri = selected[0];
        const jarPath = uri.fsPath;

        const hasWorkspace = !!vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
        const scopeChoices: vscode.QuickPickItem[] = [
            { label: 'User', description: 'Save for all workspaces on this machine' },
            { label: 'Workspace', description: 'Save for the current workspace' }
        ];
        const scopePick = await vscode.window.showQuickPick(scopeChoices, { placeHolder: 'Save setting scope' });
        if (!scopePick) {
            return;
        }

        if (scopePick.label === 'User') {
            const cfg = vscode.workspace.getConfiguration(SETTING_SECTION);
            await cfg.update(SETTING_KEY, jarPath, vscode.ConfigurationTarget.Global);
            await vscode.commands.executeCommand('workbench.action.openUserSettings', `${SETTING_SECTION}.${SETTING_KEY}`);
            vscode.window.showInformationMessage('Saved Code Model Extractor JAR path to User settings.');
            return;
        }

        if (scopePick.label === 'Workspace') {
            if (!hasWorkspace) {
                vscode.window.showWarningMessage('No workspace is open to save Workspace settings.');
                return;
            }
            const cfg = vscode.workspace.getConfiguration(SETTING_SECTION);
            await cfg.update(SETTING_KEY, jarPath, vscode.ConfigurationTarget.Workspace);
            await vscode.commands.executeCommand('workbench.action.openWorkspaceSettings', `${SETTING_SECTION}.${SETTING_KEY}`);
            vscode.window.showInformationMessage('Saved Code Model Extractor JAR path to Workspace settings.');
            return;
        }
    });

    context.subscriptions.push(disposable);
}


