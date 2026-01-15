import * as vscode from 'vscode';
import * as path from 'path';
import {
    CONSTANTS_FILE_PATH_STORAGE_DIR,
    CONSTANTS_FILE_PATH_HISTORY,
    CONSTANTS_FILE_PATH_ARDOCO_CONFIG
} from '../constants';

/**
 * Service for setting up file system watchers
 */
export class FileWatcherService {
    /**
     * Creates file system watchers for trace-viz files and registers them
     * @param onChange Callback to invoke when files change
     * @returns Array of disposables for the watchers
     */
    static createTraceVizWatchers(onChange: () => void): vscode.Disposable[] {
        const disposables: vscode.Disposable[] = [];
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) {
            return disposables;
        }

        const traceVizDir = path.join(ws.uri.fsPath, CONSTANTS_FILE_PATH_STORAGE_DIR);
        const historyFile = path.join(traceVizDir, CONSTANTS_FILE_PATH_HISTORY);
        const configFile = path.join(traceVizDir, CONSTANTS_FILE_PATH_ARDOCO_CONFIG);

        const addWatcher = (filePath: string) => {
            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(path.dirname(filePath), path.basename(filePath))
            );
            watcher.onDidChange(() => onChange());
            watcher.onDidCreate(() => onChange());
            watcher.onDidDelete(() => onChange());
            disposables.push(watcher);
        };

        addWatcher(historyFile);
        addWatcher(configFile);

        return disposables;
    }
}

