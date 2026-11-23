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
     * Builds the display name of a history entry: its label, else approach and original name
     */
    static displayName(e: { label?: unknown; approach?: unknown; originalName?: unknown; id?: unknown }): string {
        if (typeof e.label === 'string' && e.label.trim()) {
            return e.label.trim();
        }
        const parts = [e.approach, e.originalName].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
        return parts.length > 0 ? parts.join(' · ') : String(e.id ?? 'Trace links');
    }

    /**
     * Short form of a display name for compact places (status bar, comparison phrases):
     * the name without a trailing parenthetical, e.g. "ArDoCode (precomputed)" becomes "ArDoCode"
     */
    static shortName(name: string): string {
        const short = name.replace(/\s*\([^()]*\)\s*$/, '').trim();
        return short || name;
    }

    /**
     * Whether a history entry is a gold standard: the explicit `isGoldStandard` flag if set,
     * else "gold" in its label, original name or approach
     */
    static isGoldStandard(e: { isGoldStandard?: unknown; label?: unknown; originalName?: unknown; approach?: unknown }): boolean {
        if (typeof e.isGoldStandard === 'boolean') {
            return e.isGoldStandard;
        }
        return [e.label, e.originalName, e.approach].some(p => typeof p === 'string' && /gold/i.test(p));
    }

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
                    color: (e.color || 'blue') as VizColor,
                    name: HistoryReaderService.displayName(e),
                    isGoldStandard: HistoryReaderService.isGoldStandard(e)
                }));
        } catch {
            return [];
        }
    }
}

