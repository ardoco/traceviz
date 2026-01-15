import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CONSTANTS_FILE_PATH_STORAGE_DIR } from '../constants';

/**
 * Utility class for managing the .trace-viz storage directory
 * Provides centralized methods for directory creation, path resolution, and file operations
 */
export class TraceVizStorageUtil {
    /**
     * Gets the workspace folder, showing a warning if none is open
     * @returns The first workspace folder, or undefined if no workspace is open
     */
    static getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return undefined;
        }
        return vscode.workspace.workspaceFolders[0];
    }

    /**
     * Gets the storage directory path for the current workspace
     * @param workspaceFolder Optional workspace folder. If not provided, uses the first workspace folder
     * @returns The storage directory path, or undefined if no workspace is open
     */
    static getStorageDirectory(workspaceFolder?: vscode.WorkspaceFolder): string | undefined {
        const folder = workspaceFolder || this.getWorkspaceFolder();
        if (!folder) {
            return undefined;
        }
        return path.join(folder.uri.fsPath, CONSTANTS_FILE_PATH_STORAGE_DIR);
    }

    /**
     * Ensures the storage directory exists, creating it if necessary
     * @param workspaceFolder Optional workspace folder. If not provided, uses the first workspace folder
     * @returns The storage directory path, or undefined if no workspace is open or creation failed
     */
    static ensureStorageDirectory(workspaceFolder?: vscode.WorkspaceFolder): string | undefined {
        const storageDir = this.getStorageDirectory(workspaceFolder);
        if (!storageDir) {
            return undefined;
        }

        if (!fs.existsSync(storageDir)) {
            try {
                fs.mkdirSync(storageDir, { recursive: true });
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create storage directory: ${error}`);
                return undefined;
            }
        }

        return storageDir;
    }

    /**
     * Gets the full path to a file within the storage directory
     * Ensures the storage directory exists before returning the path
     * @param filename Name of the file (can include subdirectories)
     * @param workspaceFolder Optional workspace folder. If not provided, uses the first workspace folder
     * @returns The full file path, or undefined if no workspace is open
     */
    static getStorageFilePath(filename: string, workspaceFolder?: vscode.WorkspaceFolder): string | undefined {
        const storageDir = this.ensureStorageDirectory(workspaceFolder);
        if (!storageDir) {
            return undefined;
        }
        return path.join(storageDir, filename);
    }

    /**
     * Checks if a file exists in the storage directory
     * @param filename Name of the file (can include subdirectories)
     * @param workspaceFolder Optional workspace folder. If not provided, uses the first workspace folder
     * @returns True if the file exists, false otherwise
     */
    static fileExists(filename: string, workspaceFolder?: vscode.WorkspaceFolder): boolean {
        const filePath = this.getStorageFilePath(filename, workspaceFolder);
        if (!filePath) {
            return false;
        }
        return fs.existsSync(filePath);
    }

    /**
     * Reads a file from the storage directory
     * @param filename Name of the file (can include subdirectories)
     * @param workspaceFolder Optional workspace folder. If not provided, uses the first workspace folder
     * @returns The file contents as a string, or undefined if the file doesn't exist or can't be read
     */
    static readFile(filename: string, workspaceFolder?: vscode.WorkspaceFolder): string | undefined {
        const filePath = this.getStorageFilePath(filename, workspaceFolder);
        if (!filePath || !fs.existsSync(filePath)) {
            return undefined;
        }

        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to read file ${filename}: ${error}`);
            return undefined;
        }
    }

    /**
     * Writes content to a file in the storage directory
     * Ensures the storage directory exists before writing
     * @param filename Name of the file (can include subdirectories)
     * @param content Content to write to the file
     * @param workspaceFolder Optional workspace folder. If not provided, uses the first workspace folder
     * @returns True if the write was successful, false otherwise
     */
    static writeFile(filename: string, content: string, workspaceFolder?: vscode.WorkspaceFolder): boolean {
        const filePath = this.getStorageFilePath(filename, workspaceFolder);
        if (!filePath) {
            return false;
        }

        try {
            fs.writeFileSync(filePath, content, 'utf8');
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to write file ${filename}: ${error}`);
            return false;
        }
    }

    /**
     * Reads and parses a JSON file from the storage directory
     * @param filename Name of the JSON file (can include subdirectories)
     * @param workspaceFolder Optional workspace folder. If not provided, uses the first workspace folder
     * @returns The parsed JSON object, or undefined if the file doesn't exist or parsing fails
     */
    static readJsonFile<T>(filename: string, workspaceFolder?: vscode.WorkspaceFolder): T | undefined {
        const content = this.readFile(filename, workspaceFolder);
        if (!content) {
            return undefined;
        }

        try {
            return JSON.parse(content) as T;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to parse JSON file ${filename}: ${error}`);
            return undefined;
        }
    }

    /**
     * Writes an object as JSON to a file in the storage directory
     * @param filename Name of the JSON file (can include subdirectories)
     * @param data Object to serialize to JSON
     * @param indent Number of spaces for indentation (default: 2)
     * @param workspaceFolder Optional workspace folder. If not provided, uses the first workspace folder
     * @returns True if the write was successful, false otherwise
     */
    static writeJsonFile(
        filename: string,
        data: any,
        indent: number = 2,
        workspaceFolder?: vscode.WorkspaceFolder
    ): boolean {
        try {
            const content = JSON.stringify(data, null, indent);
            return this.writeFile(filename, content, workspaceFolder);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to serialize JSON for file ${filename}: ${error}`);
            return false;
        }
    }
}

