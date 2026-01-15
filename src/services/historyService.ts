import * as vscode from 'vscode';
import { VizColor, TraceHistoryEntry } from '../types';
import {
    CONSTANTS_FILE_PATH_HISTORY,
    CONSTANTS_NUMBER_MAX_ACTIVE_VISUALIZATIONS,
    CONSTANTS_NUMBER_JSON_INDENT
} from '../constants';
import { TraceVizStorageUtil } from '../utils/traceVizStorage.util';

/**
 * Reads the trace history from the workspace
 * @returns Array of trace history entries, or empty array if file doesn't exist or parsing fails
 */
export function readHistory(): TraceHistoryEntry[] {
    return TraceVizStorageUtil.readJsonFile<TraceHistoryEntry[]>(CONSTANTS_FILE_PATH_HISTORY) || [];
}

/**
 * Writes trace history to the workspace file
 * @param history Array of trace history entries to write
 */
export function writeHistory(history: TraceHistoryEntry[]): void {
    TraceVizStorageUtil.writeJsonFile(CONSTANTS_FILE_PATH_HISTORY, history, CONSTANTS_NUMBER_JSON_INDENT);
}

/**
 * Activates a visualization for a history entry
 * @param historyId ID of the history entry to activate
 */
export function showVisualization(historyId: string): void {
    const history = readHistory();
    const activeCount = history.filter(e => e.active === true).length;
    const idx = history.findIndex(e => e.id === historyId);
    if (idx === -1) {return;}
    if (activeCount >= CONSTANTS_NUMBER_MAX_ACTIVE_VISUALIZATIONS) {
        vscode.window.showWarningMessage(`Only ${CONSTANTS_NUMBER_MAX_ACTIVE_VISUALIZATIONS} visualizations can be active at once.`);
        return;
    }
    history[idx].active = true;
    if (!history[idx].color) {history[idx].color = 'blue';}
    writeHistory(history);
}

/**
 * Deactivates a visualization for a history entry
 * @param historyId ID of the history entry to deactivate
 */
export function hideVisualization(historyId: string): void {
    const history = readHistory();
    const idx = history.findIndex(e => e.id === historyId);
    if (idx === -1) {return;}
    history[idx].active = false;
    writeHistory(history);
}

/**
 * Cycles the visualization color for a history entry through the available colors
 * @param historyId ID of the history entry to cycle color for
 */
export function cycleVisualizationColor(historyId: string): void {
    const order: VizColor[] = ['blue', 'red', 'orange', 'green'];
    const history = readHistory();
    const idx = history.findIndex(e => e.id === historyId);
    if (idx === -1) {return;}
    const cur = history[idx].color && order.includes(history[idx].color as VizColor) ? (history[idx].color as VizColor) : 'blue';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    history[idx].color = next;
    writeHistory(history);
}


