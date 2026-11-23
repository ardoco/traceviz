import * as vscode from 'vscode';
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

        const traceVizDir = vscode.Uri.joinPath(ws.uri, CONSTANTS_FILE_PATH_STORAGE_DIR);

        const addWatcher = (fileName: string) => {
            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(traceVizDir, fileName)
            );
            watcher.onDidChange(() => onChange());
            watcher.onDidCreate(() => onChange());
            watcher.onDidDelete(() => onChange());
            disposables.push(watcher);
        };

        addWatcher(CONSTANTS_FILE_PATH_HISTORY);
        addWatcher(CONSTANTS_FILE_PATH_ARDOCO_CONFIG);

        return disposables;
    }
}

