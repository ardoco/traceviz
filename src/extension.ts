// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { registerCommonFeatures } from './extensionCommon';
import { registerBrowseCodeModelExtractorJarCommand } from './commands/browseJar';
import { registerArDoCoWebviewCommand } from './traceabilityApproach/ardoco/configArDoCo';
import { registerLissaWebviewCommand } from './traceabilityApproach/lissa/configLissa';
import { generateArDoCoCodeModel } from './traceabilityApproach/ardoco/generateArDoCoCodeModel';
import { generateSadCodeTraceLinks, generateTransArcTraceLinks } from './traceabilityApproach/ardoco/generateTraceLinks';
import {
    CONSTANTS_COMMAND_ARDOCO_GENERATE_MODEL,
    CONSTANTS_COMMAND_SAD_CODE,
    CONSTANTS_COMMAND_SAD_SAM_CODE
} from './constants';

/**
 * This method is called when your extension is activated
 * Your extension is activated the very first time the command is executed
 * @param context VS Code extension context for registering commands and providers
 */
export function activate(context: vscode.ExtensionContext) {
	// Features shared with the web extension (visualization, views, CSV Direct)
	registerCommonFeatures(context, { nodeFeatures: true });

	// Command: Browse for Code Model Extractor JAR and save to settings
	registerBrowseCodeModelExtractorJarCommand(context);

	// Command: ArDoCo webview
	registerArDoCoWebviewCommand(context);

	// Command: LiSSA webview
	registerLissaWebviewCommand(context);

	// Command: ArDoCo Generate Code Model
	const ardoCoGenerateModel = vscode.commands.registerCommand(CONSTANTS_COMMAND_ARDOCO_GENERATE_MODEL, async () => {
		await generateArDoCoCodeModel();
	});
	context.subscriptions.push(ardoCoGenerateModel);

	// Command: SAD-Code Trace Links
	const sadCode = vscode.commands.registerCommand(CONSTANTS_COMMAND_SAD_CODE, async () => {
		await generateSadCodeTraceLinks();
	});
	context.subscriptions.push(sadCode);

	const sadSamCode = vscode.commands.registerCommand(CONSTANTS_COMMAND_SAD_SAM_CODE, async () => {
		await generateTransArcTraceLinks();
	});
	context.subscriptions.push(sadSamCode);
}

/**
 * This method is called when your extension is deactivated
 */
export function deactivate() {}
