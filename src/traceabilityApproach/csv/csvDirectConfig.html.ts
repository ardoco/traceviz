import { CONFIG_WEBVIEW_CSS } from '../configWebview.css';

/**
 * Configuration for CSV Direct import
 */
export interface CsvDirectConfig {
    /** Path to the CSV file */
    csvPath: string;
    /** Path to the documentation file */
    documentationPath: string;
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
 * Generates the HTML content for the CSV Direct configuration webview
 * @param config CSV Direct configuration object
 * @returns HTML string for the webview
 */
export function getCsvDirectConfigWebviewHtml(config: CsvDirectConfig): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSV Direct Configuration</title>
    <style>
${CONFIG_WEBVIEW_CSS}
    </style>
</head>
<body>
    <div class="container">
        <h1>CSV Direct Configuration</h1>
        
        <div class="info-box">
            <strong>CSV Direct</strong><br>
            Import a CSV file with trace links and associate it with a documentation file.
        </div>

        <form id="csvDirectForm">
            <div class="form-group">
                <label for="csvPath"><sup>*</sup>CSV File:</label>
                <div class="input-group">
                    <input type="text" id="csvPath" placeholder="Path to CSV file" value="${escapeHtml(config.csvPath)}" required readonly/>
                    <button type="button" class="browse-btn" onclick="browseFile('csvPath')">Browse...</button>
                </div>
            </div>

            <div class="form-group">
                <label for="documentationPath"><sup>*</sup>Documentation File:</label>
                <div class="input-group">
                    <input type="text" id="documentationPath" placeholder="Path to documentation file" value="${escapeHtml(config.documentationPath)}" required readonly/>
                    <button type="button" class="browse-btn" onclick="browseFile('documentationPath')">Browse...</button>
                </div>
            </div>

            <div class="button-group">
                <button type="button" class="btn-secondary" onclick="cancel()">Cancel</button>
                <button type="submit" class="btn-primary">Save</button>
            </div>
        </form>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Handle form submission
        document.getElementById('csvDirectForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const csvPath = document.getElementById('csvPath').value;
            const documentationPath = document.getElementById('documentationPath').value;
            
            vscode.postMessage({
                command: 'save',
                data: {
                    csvPath: csvPath,
                    documentationPath: documentationPath
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

