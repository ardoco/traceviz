import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    CONSTANTS_FILE_PATH_STORAGE_DIR,
    CONSTANTS_FILE_PATH_ARDOCO_CONFIG,
    CONSTANTS_CONFIG_KEY_DOCUMENTATION_PATH
} from '../constants';

/**
 * Service for reading configuration files
 */
export class ConfigReaderService {
    /**
     * Reads the documentation path from ArDoCo configuration
     * @returns Documentation file path or undefined if not found
     */
    static readDocumentationPath(): string | undefined {
        const ws = vscode.workspace.workspaceFolders?.[0];
        if (!ws) {
            return undefined;
        }
        const configFile = path.join(ws.uri.fsPath, CONSTANTS_FILE_PATH_STORAGE_DIR, CONSTANTS_FILE_PATH_ARDOCO_CONFIG);
        try {
            if (!fs.existsSync(configFile)) {
                return undefined;
            }
            const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
            return typeof cfg?.[CONSTANTS_CONFIG_KEY_DOCUMENTATION_PATH] === 'string' ? cfg[CONSTANTS_CONFIG_KEY_DOCUMENTATION_PATH] : undefined;
        } catch {
            return undefined;
        }
    }
}

