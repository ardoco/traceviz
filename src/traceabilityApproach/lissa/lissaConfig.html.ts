import { CONFIG_WEBVIEW_CSS } from '../configWebview.css';

/**
 * Configuration for LiSSA
 */
export interface LissaConfig {
    /** JSON configuration content */
    jsonConfig: string;
    /** Path to the JAR file to execute */
    jarPath: string;
}

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
 * Escapes textarea content to prevent XSS while preserving formatting
 * Only escapes the closing textarea tag to prevent injection
 * @param text Text to escape
 * @returns Escaped textarea content
 */
function escapeTextareaContent(text: string): string {
    if (!text) {
        return '';
    }
    // Only escape the closing textarea tag to prevent XSS
    return text.replace(/<\/textarea>/gi, '&lt;/textarea&gt;');
}

/**
 * Generates the HTML content for the LiSSA configuration webview
 * @param config LiSSA configuration object
 * @returns HTML string for the webview
 */
export function getLissaConfigWebviewHtml(config: LissaConfig): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LiSSA Configuration</title>
    <style>
${CONFIG_WEBVIEW_CSS}
    textarea {
        height: 400px;
        resize: vertical;
        font-family: var(--vscode-editor-font-family);
        font-size: var(--vscode-editor-font-size);
    }
    </style>
</head>
<body>
    <div class="container">
        <h1>LiSSA Configuration</h1>
        
        <div class="info-box">
            <strong>LiSSA</strong><br>
            Configure the LiSSA traceability approach. Provide a JSON configuration and the JAR file to execute.
        </div>

        <form id="lissaForm">
            <div class="form-group">
                <label for="jarPath"><sup>*</sup>JAR File:</label>
                <div class="input-group">
                    <input type="text" id="jarPath" placeholder="Path to JAR file" value="${escapeHtml(config.jarPath)}" required readonly/>
                    <button type="button" class="browse-btn" onclick="browseFile('jarPath')">Browse...</button>
                </div>
            </div>

            <div class="form-group">
                <label for="jsonConfig"><sup>*</sup>JSON Configuration:</label>
                <textarea id="jsonConfig" placeholder="Enter JSON configuration here..." required>${escapeTextareaContent(config.jsonConfig)}</textarea>
            </div>

            <div class="button-group">
                <button type="button" class="btn-secondary" onclick="cancel()">Cancel</button>
                <button type="submit" class="btn-primary">Save Configuration</button>
            </div>
        </form>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Handle form submission
        document.getElementById('lissaForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const jarPath = document.getElementById('jarPath').value;
            const jsonConfig = document.getElementById('jsonConfig').value;
            
            // Validate JSON
            try {
                JSON.parse(jsonConfig);
            } catch (error) {
                vscode.postMessage({
                    command: 'error',
                    message: 'Invalid JSON configuration: ' + error.message
                });
                return;
            }
            
            vscode.postMessage({
                command: 'save',
                data: {
                    jarPath: jarPath,
                    jsonConfig: jsonConfig
                }
            });
        });

        // Handle file browser
        function browseFile(field) {
            vscode.postMessage({
                command: 'pickFile',
                field: field
            });
        }

        // Handle cancel
        function cancel() {
            vscode.postMessage({
                command: 'cancel'
            });
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateField':
                    document.getElementById(message.field).value = message.value;
                    break;
            }
        });
    </script>
</body>
</html>`;

}

