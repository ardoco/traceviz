// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { registerVisualizationCommands } from './commands/visualization';
import { registerOpenDocumentationCommand } from './commands/openDocumentation';
import { registerOpenCsvCommand } from './commands/openCsv';
import { registerLineToFileVisualization } from './visualization/lineToFileVisualization';
import { TraceabilityApproachViewProvider } from './views/traceabilityApproachViewProvider';
import { TraceHistoryViewProvider } from './views/traceHistoryViewProvider';
import { registerBrowseCodeModelExtractorJarCommand } from './commands/browseJar';
import { registerCsvDirectCommand } from './traceabilityApproach/csv/csvDirect';
import { registerArDoCoWebviewCommand } from './traceabilityApproach/ardoco/configArDoCo';
import { registerLissaWebviewCommand } from './traceabilityApproach/lissa/configLissa';
import { generateArDoCoCodeModel } from './traceabilityApproach/ardoco/generateArDoCoCodeModel';
import { generateSadCodeTraceLinks } from './traceabilityApproach/ardoco/sadCode';
import {
    CONSTANTS_VIEW_ID_APPROACH,
    CONSTANTS_VIEW_ID_HISTORY,
    CONSTANTS_COMMAND_OPEN_SETTINGS,
    CONSTANTS_COMMAND_REFRESH_HISTORY,
    CONSTANTS_COMMAND_ARDOCO_GENERATE_MODEL,
    CONSTANTS_COMMAND_ARDOCO_GENERATE_LINKS,
    CONSTANTS_COMMAND_SAD_CODE,
    CONSTANTS_COMMAND_SAM_CODE,
    CONSTANTS_COMMAND_SAD_SAM,
    CONSTANTS_COMMAND_SAD_SAM_CODE,
    CONSTANTS_COMMAND_REFRESH_APPROACH,
    CONSTANTS_STRING_VSCODE_COMMAND_OPEN_SETTINGS,
    CONSTANTS_STRING_VSCODE_SETTINGS_EXT_PREFIX
} from './constants';
import { Logger } from './utils/logger.util';

/**
 * This method is called when your extension is activated
 * Your extension is activated the very first time the command is executed
 * @param context VS Code extension context for registering commands and providers
 */
export function activate(context: vscode.ExtensionContext) {
    // Initialize logger
    Logger.initialize(context);
    Logger.info('Trace Viz extension activated');

    // Register modular commands
    registerVisualizationCommands(context);
    registerOpenDocumentationCommand(context);
    registerOpenCsvCommand(context);
	registerLineToFileVisualization(context);

	const approachProvider = new TraceabilityApproachViewProvider();
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

	// Command: Browse for Code Model Extractor JAR and save to settings
	registerBrowseCodeModelExtractorJarCommand(context);

	// Command: CSV Direct file picker
	registerCsvDirectCommand(context);

	// Command: ArDoCo webview
	registerArDoCoWebviewCommand(context);

	// Command: LiSSA webview
	registerLissaWebviewCommand(context);

	// Command: Refresh Trace History
	const refreshHistory = vscode.commands.registerCommand(CONSTANTS_COMMAND_REFRESH_HISTORY, () => {
		(global as any).traceVizHistoryProvider?.refresh();
	});
	context.subscriptions.push(refreshHistory);

	// Command: ArDoCo Generate Code Model
	const ardoCoGenerateModel = vscode.commands.registerCommand(CONSTANTS_COMMAND_ARDOCO_GENERATE_MODEL, async () => {
		await generateArDoCoCodeModel();
	});
	context.subscriptions.push(ardoCoGenerateModel);

	// Command: ArDoCo Generate Trace Links
	const ardoCoGenerateLinks = vscode.commands.registerCommand(CONSTANTS_COMMAND_ARDOCO_GENERATE_LINKS, () => {
		vscode.window.showInformationMessage('Generate Trace Links');
	});
	context.subscriptions.push(ardoCoGenerateLinks);

	// Command: SAD-Code Trace Links
	const sadCode = vscode.commands.registerCommand(CONSTANTS_COMMAND_SAD_CODE, async () => {
		await generateSadCodeTraceLinks();
	});
	context.subscriptions.push(sadCode);

	// Placeholder commands for other trace link types
	const samCode = vscode.commands.registerCommand(CONSTANTS_COMMAND_SAM_CODE, () => {
		vscode.window.showInformationMessage('SAM-Code trace links (not implemented yet)');
	});
	context.subscriptions.push(samCode);

	const sadSam = vscode.commands.registerCommand(CONSTANTS_COMMAND_SAD_SAM, () => {
		vscode.window.showInformationMessage('SAD-SAM trace links (not implemented yet)');
	});
	context.subscriptions.push(sadSam);

	const sadSamCode = vscode.commands.registerCommand(CONSTANTS_COMMAND_SAD_SAM_CODE, () => {
		vscode.window.showInformationMessage('SAD-SAM-Code trace links (not implemented yet)');
	});
	context.subscriptions.push(sadSamCode);

	// Command: Refresh Trace Approach
	const refreshApproach = vscode.commands.registerCommand(CONSTANTS_COMMAND_REFRESH_APPROACH, () => {
		(global as any).traceVizApproachProvider?.refresh();
	});
	context.subscriptions.push(refreshApproach);
}

/**
 * This method is called when your extension is deactivated
 */
export function deactivate() {}


