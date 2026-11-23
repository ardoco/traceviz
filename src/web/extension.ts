// Entry point of TraceViz in VS Code for the Web (package.json "browser").
// Bundled by esbuild.js, which replaces the Node.js modules `fs` and `path` with ./fs and ./path.
import * as vscode from 'vscode';
import { registerCommonFeatures } from '../extensionCommon';
import { preloadWorkspace, whenSettled } from './fs';
import { FileWatcherService } from '../services/fileWatcher.service';
import {
    CONSTANTS_COMMAND_BROWSE_JAR,
    CONSTANTS_COMMAND_ARDOCO_GENERATE_MODEL
} from '../constants';

/** Commands of the desktop extension that need Node.js (local JARs, child processes) */
const DESKTOP_ONLY_COMMANDS = [
    CONSTANTS_COMMAND_BROWSE_JAR,
    'trace-viz.openLissaWebview',
    CONSTANTS_COMMAND_ARDOCO_GENERATE_MODEL
];

/**
 * Activates TraceViz in the web extension host
 * @param context VS Code extension context for registering commands and providers
 */
export async function activate(context: vscode.ExtensionContext) {
    // The shared code reads the workspace synchronously, so mirror it first
    await preloadWorkspace(context);
    // Reload only after the mirror has picked up a change
    FileWatcherService.whenReady = whenSettled;

    registerCommonFeatures(context, { nodeFeatures: false });

    for (const command of DESKTOP_ONLY_COMMANDS) {
        context.subscriptions.push(vscode.commands.registerCommand(command, () => {
            vscode.window.showInformationMessage('This feature needs the desktop version of TraceViz (local Java tools). In VS Code for the Web, select an existing JSON code model for ARDoCo or import trace links with CSV Direct.');
        }));
    }
}

/**
 * This method is called when your extension is deactivated
 */
export function deactivate() {}
