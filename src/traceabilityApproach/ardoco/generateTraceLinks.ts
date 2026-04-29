import * as vscode from 'vscode';
import * as fs from 'fs';
import { convert, writeTextFile } from './convert';
import { ArDoCoConfig, TraceHistoryEntry, ARDOCO_TRACE_LINK_TYPE, ArDoCoTraceLinkType } from '../../types';
import { CONSTANTS_FILE_PATH_ARDOCO_CONFIG, CONSTANTS_FILE_PATH_ARDOCO_CODE_MODEL, CONSTANTS_FILE_PATH_HISTORY, CONSTANTS_NUMBER_JSON_INDENT } from '../../constants';
import { TraceVizStorageUtil } from '../../utils/traceVizStorage.util';
import { Logger } from '../../utils/logger.util';
import { ArDoCoApiUtil } from '../../utils/ardocoApi.util';

// ============================================================================
// Approach configuration (exported for use by approach-specific files)
// ============================================================================

export interface TraceLinkApproach {
    traceLinkType: ArDoCoTraceLinkType;
    displayName: string;
    idPrefix: string;
    requiresArchitectureModel: boolean;
    architectureModelFormat?: string;
    csvPrefix: string;
}

// ============================================================================
// Shared implementation
// ============================================================================

function validatePrerequisites(approach: TraceLinkApproach): {
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
        vscode.window.showErrorMessage('ARDoCo configuration not found. Please configure ARDoCo first.');
        return null;
    }

    const codeModelFile = TraceVizStorageUtil.getStorageFilePath(CONSTANTS_FILE_PATH_ARDOCO_CODE_MODEL, workspaceFolder);
    if (!codeModelFile || !fs.existsSync(codeModelFile)) {
        vscode.window.showErrorMessage('Code model not found. Please generate the code model first.');
        return null;
    }

    const config = TraceVizStorageUtil.readJsonFile<ArDoCoConfig>(CONSTANTS_FILE_PATH_ARDOCO_CONFIG, workspaceFolder);
    if (!config) {
        vscode.window.showErrorMessage('Failed to read ARDoCo configuration.');
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

    if (approach.requiresArchitectureModel) {
        if (!config.architectureModelPath) {
            vscode.window.showErrorMessage(`Architecture model path not configured in ARDoCo settings. ${approach.displayName} requires a UML architecture model.`);
            return null;
        }
        if (!fs.existsSync(config.architectureModelPath)) {
            vscode.window.showErrorMessage(`Architecture model file not found: ${config.architectureModelPath}`);
            return null;
        }
    }

    return { workspaceFolder, config, codeModelFile };
}

function createHistoryEntry(approach: TraceLinkApproach): TraceHistoryEntry {
    return {
        id: `${approach.idPrefix}-${Date.now()}`,
        timestamp: new Date().toLocaleString('de-DE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        }),
        approach: approach.displayName,
        csvPath: '',
        originalName: `${approach.displayName} Trace Links`,
        status: 'loading',
        requestId: '',
        active: false,
        color: 'blue',
    };
}

function logConfiguration(approach: TraceLinkApproach, config: ArDoCoConfig, codeModelFile: string): void {
    Logger.debug(`${approach.displayName} Configuration:`);
    Logger.debug('- REST API URL:', config.restApiUrl);
    Logger.debug('- Project Name:', config.projectName);
    Logger.debug('- Documentation Path:', config.documentationPath);
    Logger.debug('- Code Model Path:', codeModelFile);
    Logger.debug('- Documentation exists:', fs.existsSync(config.documentationPath));
    Logger.debug('- Code Model exists:', fs.existsSync(codeModelFile));

    const docStats = fs.statSync(config.documentationPath);
    const codeModelStats = fs.statSync(codeModelFile);
    Logger.debug('File sizes:');
    Logger.debug('- Documentation:', docStats.size, 'bytes');
    Logger.debug('- Code Model:', codeModelStats.size, 'bytes');

    if (approach.requiresArchitectureModel && config.architectureModelPath) {
        Logger.debug('- Architecture Model Path:', config.architectureModelPath);
        Logger.debug('- Architecture Model exists:', fs.existsSync(config.architectureModelPath));
        Logger.debug('- Architecture Model:', fs.statSync(config.architectureModelPath).size, 'bytes');
    }
}

async function saveTraceLinkResults(
    approach: TraceLinkApproach,
    result: any,
    requestId: string,
    workspaceFolder: vscode.WorkspaceFolder,
    historyEntry: TraceHistoryEntry
): Promise<string> {
    const codeModelPath = TraceVizStorageUtil.getStorageFilePath(CONSTANTS_FILE_PATH_ARDOCO_CODE_MODEL, workspaceFolder) ?? undefined;
    const csv = convert({ type: 'ARDOCO_SAD_CODE_TO_CSV', input: result, codeModelPath });
    const resultsFile = TraceVizStorageUtil.getStorageFilePath(`${approach.csvPrefix}-${requestId}.csv`, workspaceFolder);

    if (!resultsFile) {
        throw new Error('Failed to get storage directory path for results file');
    }

    Logger.info('Attempting to save results CSV to:', resultsFile);
    writeTextFile(resultsFile, csv);
    Logger.info('Results CSV successfully saved to:', resultsFile);

    if (fs.existsSync(resultsFile)) {
        Logger.debug('File created successfully, size:', fs.statSync(resultsFile).size, 'bytes');
    } else {
        Logger.error('File was not created!');
    }

    historyEntry.status = 'completed';
    historyEntry.csvPath = resultsFile;
    updateTraceHistoryEntry(workspaceFolder, historyEntry);

    return resultsFile;
}

async function handleSuccessfulPollResult(
    approach: TraceLinkApproach,
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

    await saveTraceLinkResults(approach, { ...result, traceLinks }, requestId, workspaceFolder, historyEntry);
    vscode.window.showInformationMessage(`${approach.displayName} trace links generated successfully!`);
    vscode.commands.executeCommand('trace-viz.refreshHistory');
}

async function generateTraceLinks(approach: TraceLinkApproach): Promise<void> {
    const validation = validatePrerequisites(approach);
    if (!validation) {
        return;
    }

    const { workspaceFolder, config, codeModelFile } = validation;
    const historyEntry = createHistoryEntry(approach);

    saveTraceHistoryEntry(workspaceFolder, historyEntry);
    vscode.commands.executeCommand('trace-viz.refreshHistory');

    try {
        logConfiguration(approach, config, codeModelFile);

        const startResponse = await ArDoCoApiUtil.startTraceLinkGeneration(config, {
            traceLinkType: approach.traceLinkType,
            documentationPath: config.documentationPath,
            codeModelFile,
            ...(approach.requiresArchitectureModel && {
                architectureModelPath: config.architectureModelPath,
                architectureModelFormat: approach.architectureModelFormat,
            }),
        });

        historyEntry.requestId = startResponse.requestId;
        updateTraceHistoryEntry(workspaceFolder, historyEntry);

        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Generating ${approach.displayName} Trace Links`,
            cancellable: true,
        }, async (progress) => {
            return await ArDoCoApiUtil.pollForResults(config, startResponse.requestId, {
                maxAttempts: 5,
                pollInterval: 60000,
                onProgress: (attempt, maxAttempts) => {
                    progress.report({
                        message: `Waiting for results... (attempt ${attempt}/${maxAttempts})`,
                        increment: 20,
                    });
                    Logger.debug(`Polling progress: ${attempt}/${maxAttempts}`);
                },
            });
        });

        await handleSuccessfulPollResult(approach, result, startResponse.requestId, workspaceFolder, historyEntry);
    } catch (error) {
        historyEntry.status = 'error';
        updateTraceHistoryEntry(workspaceFolder, historyEntry);
        vscode.window.showErrorMessage(`Failed to generate ${approach.displayName} trace links: ${error}`);
        vscode.commands.executeCommand('trace-viz.refreshHistory');
    }
}

// ============================================================================
// History helpers
// ============================================================================

function saveTraceHistoryEntry(workspaceFolder: vscode.WorkspaceFolder, entry: TraceHistoryEntry): void {
    const history = TraceVizStorageUtil.readJsonFile<TraceHistoryEntry[]>(CONSTANTS_FILE_PATH_HISTORY, workspaceFolder) || [];
    history.unshift(entry);
    TraceVizStorageUtil.writeJsonFile(CONSTANTS_FILE_PATH_HISTORY, history, CONSTANTS_NUMBER_JSON_INDENT, workspaceFolder);
}

function updateTraceHistoryEntry(workspaceFolder: vscode.WorkspaceFolder, updatedEntry: TraceHistoryEntry): void {
    Logger.debug('Updating trace history entry:', updatedEntry.id, 'with status:', updatedEntry.status);

    const history = TraceVizStorageUtil.readJsonFile<TraceHistoryEntry[]>(CONSTANTS_FILE_PATH_HISTORY, workspaceFolder);
    if (!history) {
        Logger.warn('History file does not exist');
        return;
    }

    const index = history.findIndex(e => e.id === updatedEntry.id);
    if (index !== -1) {
        history[index] = updatedEntry;
        TraceVizStorageUtil.writeJsonFile(CONSTANTS_FILE_PATH_HISTORY, history, CONSTANTS_NUMBER_JSON_INDENT, workspaceFolder);
        Logger.debug('History entry updated successfully');
    } else {
        Logger.warn('History entry not found for update:', updatedEntry.id);
    }
}

export { generateTraceLinks };

// ============================================================================
// Approaches
// ============================================================================

const SAD_CODE_APPROACH: TraceLinkApproach = {
    traceLinkType: ARDOCO_TRACE_LINK_TYPE.SAD_CODE,
    displayName: 'ArDoCode (SAD-Code)',
    idPrefix: 'sad-code',
    requiresArchitectureModel: false,
    csvPrefix: 'sad-code-results',
};

const TRANS_ARC_APPROACH: TraceLinkApproach = {
    traceLinkType: ARDOCO_TRACE_LINK_TYPE.SAD_SAM_CODE,
    displayName: 'TransArC (SAD-SAM-Code)',
    idPrefix: 'trans-arc',
    requiresArchitectureModel: true,
    architectureModelFormat: 'UML',
    csvPrefix: 'trans-arc-results',
};

export async function generateSadCodeTraceLinks(): Promise<void> {
    return generateTraceLinks(SAD_CODE_APPROACH);
}

export async function generateTransArcTraceLinks(): Promise<void> {
    return generateTraceLinks(TRANS_ARC_APPROACH);
}
