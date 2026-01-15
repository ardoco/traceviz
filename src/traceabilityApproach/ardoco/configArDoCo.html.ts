import { ArDoCoConfig } from '../../types';
import { CONFIG_WEBVIEW_CSS } from '../configWebview.css';

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param text Text to escape
 * @returns Escaped HTML string
 */
function escapeHtml(text: string): string {
    if (!text) {
        return '';
    }
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Generates the HTML content for the ArDoCo configuration webview
 * @param config ArDoCo configuration object
 * @returns HTML string for the webview
 */
export function getArDoCoConfigWebviewHtml(config: ArDoCoConfig): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ArDoCo Configuration</title>
    <style>
${CONFIG_WEBVIEW_CSS}
    </style>
</head>
<body>
    <div class="container">
        <h1>ArDoCo Configuration</h1>
        
        <div class="info-box">
            <strong>ARDoCo (Automating Requirements and Documentation Comprehension)</strong><br>
            Configure the ArDoCo traceability approach. 
        </div>

        <form id="ardoCoForm">
            <div class="form-group">
                <label for="restApiUrl"><sup>*</sup>REST-API URL:</label>
                <input type="url" id="restApiUrl" placeholder="https://rest.ardoco.de" value="${escapeHtml(config.restApiUrl)}" required/>
            </div>

            <div class="form-group">
                <label for="jarPath">Code-Model-Extractor JAR Path:</label>
                <div class="input-group">
                    <input type="text" id="jarPath" placeholder="Path to the JAR file" value="${escapeHtml(config.jarPath)}" />
                    <button type="button" class="browse-btn" onclick="browseFile('jarPath')">Browse...</button>
                </div>
            </div>

            <div class="form-group">
                <label for="projectName">Project Name:</label>
                <input type="text" id="projectName" placeholder="Name of the project" value="${escapeHtml(config.projectName)}" />
            </div>

            <div class="form-group">
                <label for="codePath">Code Path:</label>
                <div class="input-group">
                    <input type="text" id="codePath" placeholder="Path to source code directory" value="${escapeHtml(config.codePath)}" />
                    <button type="button" class="browse-btn" onclick="browseFolder('codePath')">Browse...</button>
                </div>
            </div>

            <div class="form-group">
                <label for="documentationPath">Documentation Path:</label>
                <div class="input-group">
                    <input type="text" id="documentationPath" placeholder="Path to documentation file (.txt)" value="${escapeHtml(config.documentationPath)}" />
                    <button type="button" class="browse-btn" onclick="browseFile('documentationPath')">Browse...</button>
                </div>
            </div>

            <div class="form-group">
                <label for="architectureModelPath">Architecture Model Path:</label>
                <div class="input-group">
                    <input type="text" id="architectureModelPath" placeholder="Path to architecture model file" value="${escapeHtml(config.architectureModelPath)}" />
                    <button type="button" class="browse-btn" onclick="browseFile('architectureModelPath')">Browse...</button>
                </div>
            </div>

            <div class="button-group">
                <button type="button" class="btn-secondary" onclick="cancel()">Cancel</button>
                <button type="submit" class="btn-primary">Save Configuration</button>
            </div>
        </form>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateField') {
                document.getElementById(message.field).value = message.value;
            }
        });

        document.getElementById('ardoCoForm').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const formData = {
                restApiUrl: document.getElementById('restApiUrl').value,
                jarPath: document.getElementById('jarPath').value,
                projectName: document.getElementById('projectName').value,
                codePath: document.getElementById('codePath').value,
                documentationPath: document.getElementById('documentationPath').value,
                architectureModelPath: document.getElementById('architectureModelPath').value
            };

            vscode.postMessage({
                command: 'save',
                data: formData
            });
        });

        function browseFile(fieldId) {
            vscode.postMessage({
                command: 'pickFile',
                field: fieldId
            });
        }

        function browseFolder(fieldId) {
            vscode.postMessage({
                command: 'pickFolder',
                field: fieldId
            });
        }

        function cancel() {
            vscode.postMessage({
                command: 'cancel'
            });
        }
    </script>
</body>
</html>`;
}

