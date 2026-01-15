/**
 * Shared CSS styles for configuration webviews
 * This CSS is designed to work with VS Code's webview environment and uses CSS variables
 * for theming that automatically adapts to the user's VS Code theme
 */

export const CONFIG_WEBVIEW_CSS = `
    body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background-color: var(--vscode-editor-background);
        padding: 20px;
        margin: 0;
    }
    .container {
        max-width: 600px;
        margin: 0 auto;
    }
    h1 {
        color: var(--vscode-textLink-foreground);
        border-bottom: 1px solid var(--vscode-panel-border);
        padding-bottom: 10px;
    }
    .form-group {
        margin-bottom: 20px;
    }
    label {
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
    }
    .input-group {
        display: flex;
        gap: 8px;
    }
    input, select, textarea {
        width: 100%;
        padding: 8px;
        border: 1px solid var(--vscode-input-border);
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border-radius: 3px;
        box-sizing: border-box;
    }
    .input-group input {
        flex: 1;
        width: auto;
    }
    .browse-btn {
        padding: 8px 12px;
        border: 1px solid var(--vscode-button-border);
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border-radius: 3px;
        cursor: pointer;
        white-space: nowrap;
    }
    .browse-btn:hover {
        background-color: var(--vscode-button-secondaryHoverBackground);
    }
    textarea {
        height: 100px;
        resize: vertical;
    }
    .button-group {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 30px;
    }
    button {
        padding: 10px 20px;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 14px;
    }
    .btn-primary {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
    }
    .btn-primary:hover {
        background-color: var(--vscode-button-hoverBackground);
    }
    .btn-secondary {
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
    }
    .btn-secondary:hover {
        background-color: var(--vscode-button-secondaryHoverBackground);
    }
    .info-box {
        background-color: var(--vscode-textBlockQuote-background);
        border-left: 4px solid var(--vscode-textBlockQuote-border);
        padding: 15px;
        margin: 20px 0;
    }
`;

