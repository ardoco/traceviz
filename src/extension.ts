// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { registerCommonFeatures } from './extensionCommon';
import { registerBrowseCodeModelExtractorJarCommand } from './commands/browseJar';
import { registerLissaWebviewCommand } from './traceabilityApproach/lissa/configLissa';
import { generateArDoCoCodeModel } from './traceabilityApproach/ardoco/generateArDoCoCodeModel';
import { CONSTANTS_COMMAND_ARDOCO_GENERATE_MODEL } from './constants';

/**
 * This method is called when your extension is activated
 * Your extension is activated the very first time the command is executed
 * @param context VS Code extension context for registering commands and providers
 */
export function activate(context: vscode.ExtensionContext) {
	// Features shared with the web extension (visualization, views, CSV Direct, ARDoCo REST API)
	registerCommonFeatures(context, { nodeFeatures: true });

	// Command: Browse for Code Model Extractor JAR and save to settings
	registerBrowseCodeModelExtractorJarCommand(context);

	// Command: LiSSA webview
	registerLissaWebviewCommand(context);

	// Command: ArDoCo Generate Code Model
	const ardoCoGenerateModel = vscode.commands.registerCommand(CONSTANTS_COMMAND_ARDOCO_GENERATE_MODEL, async () => {
		await generateArDoCoCodeModel();
	});
	context.subscriptions.push(ardoCoGenerateModel);
}

/**
 * This method is called when your extension is deactivated
 */
export function deactivate() {}
