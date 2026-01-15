import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { ArDoCoConfig } from '../../types';
import { CONSTANTS_FILE_PATH_ARDOCO_CONFIG, CONSTANTS_FILE_PATH_ARDOCO_CODE_MODEL } from '../../constants';
import { TraceVizStorageUtil } from '../../utils/traceVizStorage.util';

/**
 * Generates the ArDoCo code model by running the Code Model Extractor JAR
 * @throws Error if configuration is missing or generation fails
 */
export async function generateArDoCoCodeModel(): Promise<void> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace open to generate code model.');
        return;
    }

    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace open to generate code model.');
        return;
    }

    const config = TraceVizStorageUtil.readJsonFile<ArDoCoConfig>(
        CONSTANTS_FILE_PATH_ARDOCO_CONFIG,
        workspaceFolder
    );
    
    if (!config) {
        vscode.window.showErrorMessage('ArDoCo configuration not found. Please configure ArDoCo first.');
        return;
    }

    if (!config.jarPath || !config.codePath) {
        vscode.window.showErrorMessage('JAR path or code path not configured in ArDoCo settings.');
        return;
    }

    if (!fs.existsSync(config.jarPath)) {
        vscode.window.showErrorMessage(`Code model extractor JAR not found: ${config.jarPath}`);
        return;
    }

    if (!fs.existsSync(config.codePath)) {
        vscode.window.showErrorMessage(`Code path not found: ${config.codePath}`);
        return;
    }

    const codeModelFile = TraceVizStorageUtil.getStorageFilePath(
        CONSTANTS_FILE_PATH_ARDOCO_CODE_MODEL,
        workspaceFolder
    );
    
    if (!codeModelFile) {
        vscode.window.showErrorMessage('Failed to get storage directory path.');
        return;
    }
    
    return new Promise((resolve, reject) => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating Code Model",
            cancellable: true
        }, async (progress, token) => {
            return new Promise<void>((progressResolve, progressReject) => {
                progress.report({ message: "Starting code model extraction..." });

                const javaProcess = spawn('java', [
                    '-jar',
                    config.jarPath,
                    config.codePath,
                    codeModelFile
                ], {
                    cwd: workspaceFolder.uri.fsPath
                });

                let output = '';
                let errorOutput = '';

                javaProcess.stdout?.on('data', (data) => {
                    output += data.toString();
                    progress.report({ message: "Extracting code model..." });
                });

                javaProcess.stderr?.on('data', (data) => {
                    errorOutput += data.toString();
                });

                javaProcess.on('close', (code) => {
                    if (code === 0) {
                        // Check if the code model file was created successfully
                        if (fs.existsSync(codeModelFile)) {
                            vscode.window.showInformationMessage('Code model generated successfully!');
                            // Refresh the approach view to update status icons
                            vscode.commands.executeCommand('trace-viz.refreshApproach');
                            progressResolve();
                            resolve();
                        } else {
                            const errorMsg = 'Code model file was not created by the extractor';
                            vscode.window.showErrorMessage(`Failed to generate code model: ${errorMsg}`);
                            progressReject(new Error(errorMsg));
                            reject(new Error(errorMsg));
                        }
                    } else {
                        const errorMsg = errorOutput || `Process exited with code ${code}`;
                        vscode.window.showErrorMessage(`Failed to generate code model: ${errorMsg}`);
                        progressReject(new Error(errorMsg));
                        reject(new Error(errorMsg));
                    }
                });

                javaProcess.on('error', (error) => {
                    const errorMsg = `Failed to start Java process: ${error.message}`;
                    vscode.window.showErrorMessage(errorMsg);
                    progressReject(error);
                    reject(error);
                });

                token.onCancellationRequested(() => {
                    javaProcess.kill();
                    vscode.window.showInformationMessage('Code model generation cancelled.');
                    progressReject(new Error('Cancelled'));
                    reject(new Error('Cancelled'));
                });
            });
        });
    });
}
