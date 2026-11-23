import * as vscode from 'vscode';
import * as fs from 'fs';
import { convert, writeTextFile } from './convert';
import { ArDoCoConfig, TraceHistoryEntry, ARDOCO_TRACE_LINK_TYPE, ArDoCoTraceLinkType } from '../../types';
import { CONSTANTS_FILE_PATH_HISTORY, CONSTANTS_NUMBER_JSON_INDENT } from '../../constants';
import { TraceVizStorageUtil } from '../../utils/traceVizStorage.util';
import { Logger } from '../../utils/logger.util';
import { ArDoCoApiUtil, PollCancelledError } from '../../utils/ardocoApi.util';
import { toUri } from '../../utils/uri.util';
import { getArchitectureModelFormat, getCodeModelPath, readArDoCoConfig } from './configArDoCo';

// ============================================================================
// Approach configuration (exported for use by approach-specific files)
// ============================================================================

export interface TraceLinkApproach {
    traceLinkType: ArDoCoTraceLinkType;
    displayName: string;
    idPrefix: string;
    requiresArchitectureModel: boolean;
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

    const config = readArDoCoConfig(workspaceFolder);
    if (!config) {
        vscode.window.showErrorMessage('ARDoCo configuration not found. Please configure ARDoCo first.');
        return null;
    }

    const codeModelFile = getCodeModelPath(config, workspaceFolder);
    if (!codeModelFile || !fs.existsSync(codeModelFile)) {
        vscode.window.showErrorMessage('Code model not found. Please select a JSON code model or generate the code model first.');
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
            vscode.window.showErrorMessage(`Architecture model path not configured in ARDoCo settings. ${approach.displayName} requires an architecture model (PCM or UML).`);
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
    historyEntry: TraceHistoryEntry,
    codeModelFile: string
): Promise<string> {
    const codeModel = new TextDecoder().decode(await vscode.workspace.fs.readFile(toUri(codeModelFile)));
    const csv = convert({ type: 'ARDOCO_SAD_CODE_TO_CSV', input: result, codeModel });
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
    historyEntry: TraceHistoryEntry,
    codeModelFile: string
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

    await saveTraceLinkResults(approach, { ...result, traceLinks }, requestId, workspaceFolder, historyEntry, codeModelFile);
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
                architectureModelFormat: getArchitectureModelFormat(config),
            }),
        });

        historyEntry.requestId = startResponse.requestId;
        updateTraceHistoryEntry(workspaceFolder, historyEntry);

        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Generating ${approach.displayName} Trace Links`,
            cancellable: true,
        }, async (progress, token) => {
            // The Cancel button aborts the polling and the request in flight
            const abort = new AbortController();
            token.onCancellationRequested(() => abort.abort());
            return await ArDoCoApiUtil.pollForResults(config, startResponse.requestId, {
                signal: abort.signal,
                onProgress: (attempt, elapsedMs) => {
                    progress.report({ message: `Waiting for results... (${Math.round(elapsedMs / 1000)} s, check ${attempt})` });
                    Logger.debug(`Polling progress: check ${attempt} after ${elapsedMs} ms`);
                },
            });
        });

        await handleSuccessfulPollResult(approach, result, startResponse.requestId, workspaceFolder, historyEntry, codeModelFile);
    } catch (error) {
        const cancelled = error instanceof PollCancelledError;
        historyEntry.status = cancelled ? 'cancelled' : 'error';
        updateTraceHistoryEntry(workspaceFolder, historyEntry);
        if (cancelled) {
            vscode.window.showInformationMessage(`${approach.displayName} trace link generation cancelled.`);
            vscode.commands.executeCommand('trace-viz.refreshHistory');
            return;
        }
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
    csvPrefix: 'trans-arc-results',
};

export async function generateSadCodeTraceLinks(): Promise<void> {
    return generateTraceLinks(SAD_CODE_APPROACH);
}

export async function generateTransArcTraceLinks(): Promise<void> {
    return generateTraceLinks(TRANS_ARC_APPROACH);
}
