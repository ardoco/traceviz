import * as vscode from 'vscode';
import { registerVisualizationCommands } from './commands/visualization';
import { registerOpenDocumentationCommand } from './commands/openDocumentation';
import { registerOpenCsvCommand } from './commands/openCsv';
import { registerLineToFileVisualization } from './visualization/lineToFileVisualization';
import { TraceabilityApproachViewProvider } from './views/traceabilityApproachViewProvider';
import { TraceHistoryViewProvider } from './views/traceHistoryViewProvider';
import { registerCsvDirectCommand } from './traceabilityApproach/csv/csvDirect';
import { registerArDoCoQuickConfigCommands } from './traceabilityApproach/ardoco/configArDoCoQuick';
import {
    CONSTANTS_VIEW_ID_APPROACH,
    CONSTANTS_VIEW_ID_HISTORY,
    CONSTANTS_COMMAND_OPEN_SETTINGS,
    CONSTANTS_COMMAND_REFRESH_HISTORY,
    CONSTANTS_COMMAND_ARDOCO_GENERATE_LINKS,
    CONSTANTS_COMMAND_SAM_CODE,
    CONSTANTS_COMMAND_SAD_SAM,
    CONSTANTS_COMMAND_REFRESH_APPROACH,
    CONSTANTS_STRING_VSCODE_COMMAND_OPEN_SETTINGS,
    CONSTANTS_STRING_VSCODE_SETTINGS_EXT_PREFIX
} from './constants';
import { Logger } from './utils/logger.util';

/**
 * Options for registering the features shared by the desktop and the web extension
 */
export interface CommonFeatureOptions {
    /** Whether features that need Node.js (local JARs, ARDoCo REST API) are available */
    nodeFeatures: boolean;
}

/**
 * Registers everything that works in both the desktop (Node.js) and the web extension host:
 * visualization, sidebar views, trace history and CSV Direct import.
 * @param context VS Code extension context for registering commands and providers
 * @param options Options describing the capabilities of the current extension host
 */
export function registerCommonFeatures(context: vscode.ExtensionContext, options: CommonFeatureOptions): void {
    // Initialize logger
    Logger.initialize(context);
    Logger.info('Trace Viz extension activated');

    // Register modular commands
    registerVisualizationCommands(context);
    registerOpenDocumentationCommand(context);
    registerOpenCsvCommand(context);
    registerLineToFileVisualization(context);

    const approachProvider = new TraceabilityApproachViewProvider(options.nodeFeatures);
    const historyProvider = new TraceHistoryViewProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider(CONSTANTS_VIEW_ID_APPROACH, approachProvider),
        vscode.window.registerTreeDataProvider(CONSTANTS_VIEW_ID_HISTORY, historyProvider),
        approachProvider, // This will dispose the watchers when the extension is deactivated
        historyProvider
    );

    // Store providers for refresh commands
    (global as any).traceVizHistoryProvider = historyProvider;
    (global as any).traceVizApproachProvider = approachProvider;

    // Command to open extension settings (used by View Title action)
    const openSettings = vscode.commands.registerCommand(CONSTANTS_COMMAND_OPEN_SETTINGS, () => {
        vscode.commands.executeCommand(CONSTANTS_STRING_VSCODE_COMMAND_OPEN_SETTINGS, CONSTANTS_STRING_VSCODE_SETTINGS_EXT_PREFIX);
    });
    context.subscriptions.push(openSettings);

    // Command: CSV Direct file picker
    registerCsvDirectCommand(context);

    // Commands: ARDoCo configuration without the webview, selection of an existing code model
    registerArDoCoQuickConfigCommands(context);

    // Command: Refresh Trace History
    const refreshHistory = vscode.commands.registerCommand(CONSTANTS_COMMAND_REFRESH_HISTORY, () => {
        (global as any).traceVizHistoryProvider?.refresh();
    });
    context.subscriptions.push(refreshHistory);

    // Command: ArDoCo Generate Trace Links
    const ardoCoGenerateLinks = vscode.commands.registerCommand(CONSTANTS_COMMAND_ARDOCO_GENERATE_LINKS, () => {
        vscode.window.showInformationMessage('Generate Trace Links');
    });
    context.subscriptions.push(ardoCoGenerateLinks);

    // Placeholder commands for other trace link types
    const samCode = vscode.commands.registerCommand(CONSTANTS_COMMAND_SAM_CODE, () => {
        vscode.window.showInformationMessage('SAM-Code trace links (not implemented yet)');
    });
    context.subscriptions.push(samCode);

    const sadSam = vscode.commands.registerCommand(CONSTANTS_COMMAND_SAD_SAM, () => {
        vscode.window.showInformationMessage('SAD-SAM trace links (not implemented yet)');
    });
    context.subscriptions.push(sadSam);

    // Command: Refresh Trace Approach
    const refreshApproach = vscode.commands.registerCommand(CONSTANTS_COMMAND_REFRESH_APPROACH, () => {
        (global as any).traceVizApproachProvider?.refresh();
    });
    context.subscriptions.push(refreshApproach);
}
