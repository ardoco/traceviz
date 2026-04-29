import * as vscode from 'vscode';
import * as fs from 'fs';
import { convert, writeTextFile } from './convert';
import { ArDoCoConfig, TraceHistoryEntry, ARDOCO_TRACE_LINK_TYPE } from '../../types';
import { CONSTANTS_FILE_PATH_ARDOCO_CONFIG, CONSTANTS_FILE_PATH_ARDOCO_CODE_MODEL, CONSTANTS_FILE_PATH_HISTORY, CONSTANTS_NUMBER_JSON_INDENT } from '../../constants';
import { TraceVizStorageUtil } from '../../utils/traceVizStorage.util';
import { Logger } from '../../utils/logger.util';
import { ArDoCoApiUtil } from '../../utils/ardocoApi.util';

/**
 * Validates workspace and configuration for TransArC (SAD-SAM-Code) generation
 */
function validateTransArcPrerequisites(): {
    workspaceFolder: vscode.WorkspaceFolder;
    config: ArDoCoConfig;
    codeModelFile: string;
} | null {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace open to generate trace links.');
        return null;
    }

    const configFile = TraceVizStorageUtil.getStorageFilePath(CONSTANTS_FILE_PATH_ARDOCO_CONFIG, workspaceFolder);
    if (!configFile || !fs.existsSync(configFile)) {
        vscode.window.showErrorMessage('ArDoCo configuration not found. Please configure ARDoCo first.');
        return null;
    }

    const codeModelFile = TraceVizStorageUtil.getStorageFilePath(
        CONSTANTS_FILE_PATH_ARDOCO_CODE_MODEL,
        workspaceFolder
    );
    if (!codeModelFile || !fs.existsSync(codeModelFile)) {
        vscode.window.showErrorMessage('Code model not found. Please generate the code model first.');
        return null;
    }

    const config = TraceVizStorageUtil.readJsonFile<ArDoCoConfig>(
        CONSTANTS_FILE_PATH_ARDOCO_CONFIG,
        workspaceFolder
    );
    if (!config) {
        vscode.window.showErrorMessage('Failed to read ArDoCo configuration.');
        return null;
    }

    if (!config.restApiUrl || !config.projectName || !config.documentationPath) {
        vscode.window.showErrorMessage('REST API URL, project name, or documentation path not configured in ARDoCo settings.');
        return null;
    }

    if (!fs.existsSync(config.documentationPath)) {
        vscode.window.showErrorMessage(`Documentation file not found: ${config.documentationPath}`);
        return null;
    }

    if (!config.architectureModelPath) {
        vscode.window.showErrorMessage('Architecture model path not configured in ARDoCo settings. TransArC requires a UML architecture model.');
        return null;
    }

    if (!fs.existsSync(config.architectureModelPath)) {
        vscode.window.showErrorMessage(`Architecture model file not found: ${config.architectureModelPath}`);
        return null;
    }

    return { workspaceFolder, config, codeModelFile };
}

/**
 * Creates a new trace history entry for TransArC (SAD-SAM-Code) generation
 */
function createTransArcHistoryEntry(): TraceHistoryEntry {
    return {
        id: `trans-arc-${Date.now()}`,
        timestamp: new Date().toLocaleString("de-DE", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        }),
        approach: 'TransArC (SAD-SAM-Code)',
        csvPath: '',
        originalName: 'TransArC (SAD-SAM-Code) Trace Links',
        status: 'loading',
        requestId: '',
        active: false,
        color: 'blue'
    };
}

/**
 * Logs configuration details for debugging
 */
function logConfiguration(config: ArDoCoConfig, codeModelFile: string): void {
    Logger.debug('TransArC Configuration:');
    Logger.debug('- REST API URL:', config.restApiUrl);
    Logger.debug('- Project Name:', config.projectName);
    Logger.debug('- Documentation Path:', config.documentationPath);
    Logger.debug('- Code Model Path:', codeModelFile);
    Logger.debug('- Architecture Model Path:', config.architectureModelPath);
    Logger.debug('- Documentation exists:', fs.existsSync(config.documentationPath));
    Logger.debug('- Code Model exists:', fs.existsSync(codeModelFile));
    Logger.debug('- Architecture Model exists:', fs.existsSync(config.architectureModelPath));

    const docStats = fs.statSync(config.documentationPath);
    const codeModelStats = fs.statSync(codeModelFile);
    const archStats = fs.statSync(config.architectureModelPath);
    Logger.debug('File sizes:');
    Logger.debug('- Documentation:', docStats.size, 'bytes');
    Logger.debug('- Code Model:', codeModelStats.size, 'bytes');
    Logger.debug('- Architecture Model:', archStats.size, 'bytes');
}

/**
 * Generates TransArC (SAD-SAM-Code) trace links by calling the ARDoCo REST API.
 * Uploads documentation, code model, and architecture model, then polls for results.
 * @throws Error if configuration is missing or API call fails
 */
export async function generateTransArcTraceLinks(): Promise<void> {
    const validation = validateTransArcPrerequisites();
    if (!validation) {
        return;
    }

    const { workspaceFolder, config, codeModelFile } = validation;
    const historyEntry = createTransArcHistoryEntry();

    saveTraceHistoryEntry(workspaceFolder, historyEntry);
    vscode.commands.executeCommand('trace-viz.refreshHistory');

    try {
        logConfiguration(config, codeModelFile);

        const startResponse = await ArDoCoApiUtil.startTraceLinkGeneration(config, {
            traceLinkType: ARDOCO_TRACE_LINK_TYPE.SAD_SAM_CODE,
            documentationPath: config.documentationPath,
            codeModelFile: codeModelFile,
            architectureModelPath: config.architectureModelPath,
            architectureModelFormat: 'UML'
        });

        historyEntry.requestId = startResponse.requestId;
        updateTraceHistoryEntry(workspaceFolder, historyEntry);

        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating TransArC (SAD-SAM-Code) Trace Links",
            cancellable: true
        }, async (progress) => {
            return await ArDoCoApiUtil.pollForResults(config, startResponse.requestId, {
                maxAttempts: 5,
                pollInterval: 60000,
                onProgress: (attempt, maxAttempts) => {
                    progress.report({
                        message: `Waiting for results... (attempt ${attempt}/${maxAttempts})`,
                        increment: 20
                    });
                    Logger.debug(`Polling progress: ${attempt}/${maxAttempts}`);
                }
            });
        });

        await handleSuccessfulPollResult(result, startResponse.requestId, workspaceFolder, historyEntry);
    } catch (error) {
        historyEntry.status = 'error';
        updateTraceHistoryEntry(workspaceFolder, historyEntry);
        vscode.window.showErrorMessage(`Failed to generate TransArC (SAD-SAM-Code) trace links: ${error}`);
        vscode.commands.executeCommand('trace-viz.refreshHistory');
    }
}

/**
 * Saves the trace link results to a CSV file and updates the history entry
 */
async function saveTraceLinkResults(
    result: any,
    requestId: string,
    workspaceFolder: vscode.WorkspaceFolder,
    historyEntry: TraceHistoryEntry
): Promise<string> {
    const codeModelPath = TraceVizStorageUtil.getStorageFilePath(CONSTANTS_FILE_PATH_ARDOCO_CODE_MODEL, workspaceFolder) ?? undefined;
    const csv = convert({ type: 'ARDOCO_SAD_CODE_TO_CSV', input: result, codeModelPath });
    const resultsFile = TraceVizStorageUtil.getStorageFilePath(
        `trans-arc-results-${requestId}.csv`,
        workspaceFolder
    );

    if (!resultsFile) {
        throw new Error('Failed to get storage directory path for results file');
    }

    Logger.info('Attempting to save results CSV to:', resultsFile);
    writeTextFile(resultsFile, csv);
    Logger.info('Results CSV successfully saved to:', resultsFile);

    if (fs.existsSync(resultsFile)) {
        const fileStats = fs.statSync(resultsFile);
        Logger.debug('File created successfully, size:', fileStats.size, 'bytes');
    } else {
        Logger.error('File was not created!');
    }

    historyEntry.status = 'completed';
    historyEntry.csvPath = resultsFile;
    updateTraceHistoryEntry(workspaceFolder, historyEntry);

    return resultsFile;
}

/**
 * Handles a successful polling result
 */
async function handleSuccessfulPollResult(
    result: any,
    requestId: string,
    workspaceFolder: vscode.WorkspaceFolder,
    historyEntry: TraceHistoryEntry
): Promise<void> {
    Logger.debug('Processing result, message:', result.message);
    Logger.debug('traceLinks exists:', !!result.traceLinks);
    Logger.debug('traceLinks type:', typeof result.traceLinks);
    Logger.debug('traceLinks length:', result.traceLinks ? result.traceLinks.length : 'N/A');

    const traceLinks = result.traceLinks || result.result?.traceLinks;

    if (!traceLinks || !Array.isArray(traceLinks)) {
        Logger.warn('No trace links found in result');
        throw new Error('No trace links found in API response');
    }

    const normalizedResult = {
        ...result,
        traceLinks: traceLinks
    };

    await saveTraceLinkResults(normalizedResult, requestId, workspaceFolder, historyEntry);
    vscode.window.showInformationMessage('TransArC (SAD-SAM-Code) trace links generated successfully!');
    vscode.commands.executeCommand('trace-viz.refreshHistory');
}

function saveTraceHistoryEntry(workspaceFolder: vscode.WorkspaceFolder, entry: TraceHistoryEntry): void {
    let history = TraceVizStorageUtil.readJsonFile<TraceHistoryEntry[]>(
        CONSTANTS_FILE_PATH_HISTORY,
        workspaceFolder
    ) || [];

    history.unshift(entry);
    TraceVizStorageUtil.writeJsonFile(
        CONSTANTS_FILE_PATH_HISTORY,
        history,
        CONSTANTS_NUMBER_JSON_INDENT,
        workspaceFolder
    );
}

function updateTraceHistoryEntry(workspaceFolder: vscode.WorkspaceFolder, updatedEntry: TraceHistoryEntry): void {
    Logger.debug('Updating trace history entry:', updatedEntry.id, 'with status:', updatedEntry.status);

    const history = TraceVizStorageUtil.readJsonFile<TraceHistoryEntry[]>(
        CONSTANTS_FILE_PATH_HISTORY,
        workspaceFolder
    );

    if (!history) {
        Logger.warn('History file does not exist');
        return;
    }

    const index = history.findIndex(e => e.id === updatedEntry.id);
    if (index !== -1) {
        history[index] = updatedEntry;
        TraceVizStorageUtil.writeJsonFile(
            CONSTANTS_FILE_PATH_HISTORY,
            history,
            CONSTANTS_NUMBER_JSON_INDENT,
            workspaceFolder
        );
        Logger.debug('History entry updated successfully');
    } else {
        Logger.warn('History entry not found for update:', updatedEntry.id);
    }
}
