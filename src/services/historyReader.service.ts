import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ActiveHistoryItem, VizColor } from '../types';
import {
    CONSTANTS_FILE_PATH_STORAGE_DIR,
    CONSTANTS_FILE_PATH_HISTORY
} from '../constants';

/**
 * Service for reading active history items from trace history
 */
export class HistoryReaderService {
    /**
     * Reads active history items from the workspace history file
     * @returns Array of active history items
     */
    static readActiveHistoryItems(): ActiveHistoryItem[] {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) {
            return [];
        }
        const historyFile = path.join(ws.uri.fsPath, CONSTANTS_FILE_PATH_STORAGE_DIR, CONSTANTS_FILE_PATH_HISTORY);
        try {
            if (!fs.existsSync(historyFile)) {
                return [];
            }
            const list = JSON.parse(fs.readFileSync(historyFile, 'utf8')) as any[];
            return list
                .filter(e => e && e.active && typeof e.csvPath === 'string')
                .map(e => ({
                    id: e.id as string,
                    csvPath: e.csvPath as string,
                    color: (e.color || 'blue') as VizColor
                }));
        } catch {
            return [];
        }
    }
}

