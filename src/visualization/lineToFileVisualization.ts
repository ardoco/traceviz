import * as vscode from 'vscode';
import * as path from 'path';
import { VizColor, ActiveHistoryItem, LineAggregation, FileToLineAggregation } from '../types';
import { CsvReaderService } from '../services/csvReader.service';
import { HistoryReaderService } from '../services/historyReader.service';
import { ConfigReaderService } from '../services/configReader.service';
import { PathResolverService } from '../services/pathResolver.service';
import { DecorationService } from '../services/decoration.service';
import { FileWatcherService } from '../services/fileWatcher.service';
import { FileToLineAggregationService } from '../services/fileToLineAggregation.service';

/**
 * Registers the line-to-file visualization feature
 * @param context VS Code extension context for registering disposables
 */
export function registerLineToFileVisualization(context: vscode.ExtensionContext): void {
    const viz = new LineToFileVisualization();
    viz.initialize();
    context.subscriptions.push(viz);
}

/**
 * Visualization that shows trace links from documentation lines to code files
 * Displays gutter decorations, status bar items, code lenses, and hover messages
 * for lines in the documentation file that have trace links to code.
 * Also supports reverse navigation: shows status bar items in code files linking back to documentation lines.
 */
class LineToFileVisualization implements vscode.Disposable {
    private statusBarItemsByColor: Map<VizColor, vscode.StatusBarItem> = new Map();
    private fileToLineStatusBarItemsByColor: Map<VizColor, vscode.StatusBarItem> = new Map();
    private decorationByColor: Record<VizColor, vscode.TextEditorDecorationType>;
    private compositeDecorations = new Map<string, vscode.TextEditorDecorationType>();
    private disposables: vscode.Disposable[] = [];
    private lineToLinks: LineAggregation = {};
    private fileToLines: FileToLineAggregation = {};
    private documentationPath: string | undefined;
    private workspaceRoot: string | undefined;
    private codeLensEmitter = new vscode.EventEmitter<void>();

    constructor() {
        // Prepare per-color status bar items for documentation (higher priority -> left)
        const docPriorities: Record<VizColor, number> = { blue: 99, red: 98, orange: 97, green: 96 };
        (['blue', 'red', 'orange', 'green'] as VizColor[]).forEach(color => {
            const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, docPriorities[color]);
            item.command = { command: 'trace-viz.viz.jumpToCodeFromLine', arguments: [color] } as any;
            item.tooltip = 'Jump to linked code or directories';
            this.statusBarItemsByColor.set(color, item);
        });

        // Prepare per-color status bar items for code files (lower priority, different range)
        const filePriorities: Record<VizColor, number> = { blue: 89, red: 88, orange: 87, green: 86 };
        (['blue', 'red', 'orange', 'green'] as VizColor[]).forEach(color => {
            const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, filePriorities[color]);
            item.command = { command: 'trace-viz.viz.jumpToLineFromFile', arguments: [color] } as any;
            item.tooltip = 'Jump to linked documentation lines';
            this.fileToLineStatusBarItemsByColor.set(color, item);
        });

        this.decorationByColor = {
            blue: DecorationService.createGutterDot('#1f6feb'),
            red: DecorationService.createGutterDot('#f85149'),
            orange: DecorationService.createGutterDot('#d29922'),
            green: DecorationService.createGutterDot('#3fb950')
        };
    }

    public initialize(): void {
        this.disposables.push(
            vscode.commands.registerCommand('trace-viz.viz.jumpToCodeFromLine', (color?: VizColor) => this.onJumpToCode(color)),
            vscode.commands.registerCommand('trace-viz.viz.jumpToLineFromFile', (color?: VizColor) => this.onJumpToLine(color))
        );

        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.refreshRender()),
            vscode.window.onDidChangeTextEditorSelection(() => {
                this.updateStatusBar();
                this.codeLensEmitter.fire();
            }),
            vscode.workspace.onDidChangeConfiguration(() => this.reloadData()),
            vscode.workspace.onDidChangeWorkspaceFolders(() => this.reloadData())
        );

        // Register CodeLens provider
        const provider: vscode.CodeLensProvider = {
            onDidChangeCodeLenses: this.codeLensEmitter.event,
            provideCodeLenses: (document) => this.provideCodeLenses(document)
        };
        this.disposables.push(vscode.languages.registerCodeLensProvider({ scheme: 'file' }, provider));

        // Set up file watchers
        const watchers = FileWatcherService.createTraceVizWatchers(() => this.reloadData());
        this.disposables.push(...watchers);

        this.reloadData();
    }

    public dispose(): void {
        for (const item of this.statusBarItemsByColor.values()) {
            item.dispose();
        }
        for (const item of this.fileToLineStatusBarItemsByColor.values()) {
            item.dispose();
        }
        Object.values(this.decorationByColor).forEach(d => d.dispose());
        this.compositeDecorations.forEach(d => d.dispose());
        this.disposables.forEach(d => d.dispose());
    }

    private reloadData(): void {
        this.documentationPath = ConfigReaderService.readDocumentationPath();
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        this.workspaceRoot = workspaceFolder?.uri.fsPath;
        
        const activeItems = HistoryReaderService.readActiveHistoryItems();
        this.lineToLinks = this.aggregateLinks(activeItems);
        
        if (this.workspaceRoot) {
            this.fileToLines = FileToLineAggregationService.aggregateFileToLines(activeItems, this.workspaceRoot);
        } else {
            this.fileToLines = {};
        }
        
        this.refreshRender();
        this.codeLensEmitter.fire();
    }

    /**
     * Aggregates links from active history items by sentence ID (line-to-file specific)
     */
    private aggregateLinks(items: ActiveHistoryItem[]): LineAggregation {
        const agg: LineAggregation = {};
        for (const item of items) {
            const rows = CsvReaderService.readCsv(item.csvPath);
            for (const row of rows) {
                if (!agg[row.sentenceID]) {
                    agg[row.sentenceID] = [];
                }
                agg[row.sentenceID].push({ codeID: row.codeID, color: item.color, sourceId: item.id });
            }
        }
        return agg;
    }

    /**
     * Builds composite decoration ranges grouped by color combinations
     */
    private buildCompositeDecorationRanges(editor: vscode.TextEditor): Map<string, { colors: VizColor[]; options: vscode.DecorationOptions[] }> {
        const comboRanges = new Map<string, { colors: VizColor[]; options: vscode.DecorationOptions[] }>();

        for (let lineIndex = 0; lineIndex < editor.document.lineCount; lineIndex++) {
            const sentenceID = lineIndex + 1;
            const links = this.lineToLinks[sentenceID];
            if (!links || links.length === 0) {
                continue;
            }
            const colorsOnLine = Array.from(new Set<VizColor>(links.map(l => l.color)));
            // Limit to 2 as only two visualizations are allowed
            const key = colorsOnLine.sort().join('+');
            const entry = comboRanges.get(key) || { colors: colorsOnLine.slice(0, 2), options: [] };
            const fullLineRange = editor.document.lineAt(lineIndex).range;
            entry.options.push({
                range: fullLineRange,
                hoverMessage: this.buildHoverForColors(entry.colors, lineIndex)
            });
            comboRanges.set(key, entry);
        }

        return comboRanges;
    }

    /**
     * Applies composite decorations to the editor
     */
    private applyCompositeDecorations(
        editor: vscode.TextEditor,
        comboRanges: Map<string, { colors: VizColor[]; options: vscode.DecorationOptions[] }>
    ): Set<string> {
        // Clear base single-color decorations to avoid overlap
        for (const deco of Object.values(this.decorationByColor)) {
            editor.setDecorations(deco, []);
        }

        // Track used composite keys to dispose unused ones
        const usedKeys = new Set<string>();
        for (const [key, { colors, options }] of comboRanges.entries()) {
            const deco = this.getCompositeDecoration(colors);
            usedKeys.add(key);
            editor.setDecorations(deco, options);
        }

        return usedKeys;
    }

    /**
     * Cleans up unused composite decorations
     */
    private cleanupUnusedDecorations(editor: vscode.TextEditor, usedKeys: Set<string>): void {
        for (const [key, deco] of Array.from(this.compositeDecorations.entries())) {
            if (!usedKeys.has(key)) {
                editor.setDecorations(deco, []);
                deco.dispose();
                this.compositeDecorations.delete(key);
            }
        }
    }

    /**
     * Clears all decorations from visible editors
     */
    private clearAllDecorations(): void {
        for (const deco of Object.values(this.decorationByColor)) {
            vscode.window.visibleTextEditors.forEach(ed => ed.setDecorations(deco, []));
        }
    }

    private refreshRender(): void {
        this.updateStatusBar();
        const editor = vscode.window.activeTextEditor;
        if (!editor || !this.isDocumentationEditor(editor)) {
            this.clearAllDecorations();
            return;
        }

        const comboRanges = this.buildCompositeDecorationRanges(editor);
        const usedKeys = this.applyCompositeDecorations(editor, comboRanges);
        this.cleanupUnusedDecorations(editor, usedKeys);
        this.codeLensEmitter.fire();
    }

    /**
     * Checks if the editor is showing the documentation file (line-to-file specific)
     */
    private isDocumentationEditor(editor: vscode.TextEditor): boolean {
        if (!this.documentationPath) {
            return false;
        }
        try {
            const docFsPath = editor.document.uri.fsPath;
            return path.resolve(docFsPath) === path.resolve(this.documentationPath);
        } catch {
            return false;
        }
    }

    private updateStatusBar(): void {
        // Hide all by default
        for (const item of this.statusBarItemsByColor.values()) {
            item.hide();
        }
        for (const item of this.fileToLineStatusBarItemsByColor.values()) {
            item.hide();
        }
        
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        
        // Check if we're in the documentation file
        if (this.isDocumentationEditor(editor)) {
            const lineNumber = editor.selection.active.line + 1;
            const links = this.lineToLinks[lineNumber] || [];
            if (links.length === 0) {
                return;
            }
            // Group counts by color
            const byColor = new Map<VizColor, number>();
            for (const l of links) {
                byColor.set(l.color, (byColor.get(l.color) || 0) + 1);
            }
            for (const [color, count] of byColor.entries()) {
                const item = this.statusBarItemsByColor.get(color);
                if (!item) {
                    continue;
                }
                item.text = `$(link) ${count} (${color})`;
                item.command = { command: 'trace-viz.viz.jumpToCodeFromLine', arguments: [color] } as any;
                item.show();
            }
            return;
        }
        
        // Check if we're in a code file with trace links
        if (this.workspaceRoot) {
            const filePath = path.normalize(editor.document.uri.fsPath);
            const links = FileToLineAggregationService.getLinksForFile(filePath, this.fileToLines);
            
            if (links.length === 0) {
                return;
            }
            
            // Group counts by color
            const byColor = new Map<VizColor, number>();
            for (const l of links) {
                byColor.set(l.color as VizColor, (byColor.get(l.color as VizColor) || 0) + 1);
            }
            
            for (const [color, count] of byColor.entries()) {
                const item = this.fileToLineStatusBarItemsByColor.get(color);
                if (!item) {
                    continue;
                }
                item.text = `$(link) ${count} doc line${count > 1 ? 's' : ''} (${color})`;
                item.command = { command: 'trace-viz.viz.jumpToLineFromFile', arguments: [color] } as any;
                item.show();
            }
        }
    }

    private async onJumpToCode(colorFilter?: VizColor): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !this.isDocumentationEditor(editor)) {
            return;
        }
        const lineNumber = editor.selection.active.line + 1;
        let links = this.lineToLinks[lineNumber] || [];
        if (colorFilter) {
            links = links.filter(l => l.color === colorFilter);
        }
        if (links.length === 0) {
            return;
        }

        // Build quick pick list with folder/file icons
        const items = links.map(l => {
            const info = PathResolverService.resolvePathType(l.codeID);
            const isDir = info.isDir;
            const icon = isDir ? '$(folder)' : '$(file)';
            return {
                label: `${icon} ${path.basename(l.codeID) || l.codeID}`,
                description: l.codeID,
                codeID: l.codeID
            };
        });

        const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select code location to open' });
        if (!picked) {
            return;
        }
        await PathResolverService.openCodePath(picked.codeID);
    }

    /**
     * Handles jumping from a code file to linked documentation lines
     */
    private async onJumpToLine(colorFilter?: VizColor): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !this.documentationPath || !this.workspaceRoot) {
            return;
        }
        
        // Don't handle if we're in the documentation file itself
        if (this.isDocumentationEditor(editor)) {
            return;
        }
        
        const filePath = path.normalize(editor.document.uri.fsPath);
        let links = FileToLineAggregationService.getLinksForFile(filePath, this.fileToLines);
        
        if (colorFilter) {
            links = links.filter(l => l.color === colorFilter);
        }
        
        if (links.length === 0) {
            return;
        }
        
        // If only one link, jump directly
        if (links.length === 1) {
            await this.jumpToDocumentationLine(links[0].sentenceID);
            return;
        }
        
        // Multiple links: show quick pick
        const items = links.map(l => {
            return {
                label: `Line ${l.sentenceID}`,
                description: `Color: ${l.color}`,
                sentenceID: l.sentenceID,
                color: l.color
            };
        });
        
        const picked = await vscode.window.showQuickPick(items, { 
            placeHolder: 'Select documentation line to jump to' 
        });
        
        if (!picked) {
            return;
        }
        
        await this.jumpToDocumentationLine(picked.sentenceID);
    }
    
    /**
     * Opens the documentation file and jumps to the specified line
     */
    private async jumpToDocumentationLine(sentenceID: number): Promise<void> {
        if (!this.documentationPath) {
            vscode.window.showWarningMessage('Documentation file not configured.');
            return;
        }
        
        try {
            const docUri = vscode.Uri.file(this.documentationPath);
            const doc = await vscode.workspace.openTextDocument(docUri);
            const editor = await vscode.window.showTextDocument(doc);
            
            // Line numbers are 1-based, VS Code uses 0-based
            const lineIndex = sentenceID - 1;
            if (lineIndex >= 0 && lineIndex < doc.lineCount) {
                const line = doc.lineAt(lineIndex);
                editor.selection = new vscode.Selection(lineIndex, 0, lineIndex, line.text.length);
                editor.revealRange(line.range, vscode.TextEditorRevealType.InCenter);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open documentation: ${error}`);
        }
    }

    private getCompositeDecoration(colors: VizColor[]): vscode.TextEditorDecorationType {
        // Normalize to max 2 colors, sorted key
        const norm = Array.from(new Set(colors)).slice(0, 2).sort();
        const key = norm.join('+');
        const existing = this.compositeDecorations.get(key);
        if (existing) {
            return existing;
        }

        const deco = DecorationService.createCompositeDecoration(norm);
        this.compositeDecorations.set(key, deco);
        return deco;
    }

    private buildHoverForColors(colors: VizColor[], lineIndex: number): vscode.MarkdownString {
        const md = new vscode.MarkdownString(undefined, true);
        md.isTrusted = true;
        const unique = Array.from(new Set(colors)).slice(0, 2);

        const sentenceID = lineIndex + 1;
        const linksOnLine = this.lineToLinks[sentenceID] || [];
        const byColor = new Map<VizColor, number>();
        for (const l of linksOnLine) {
            byColor.set(l.color, (byColor.get(l.color) || 0) + 1);
        }

        md.appendMarkdown('**Trace-Links** |');
        md.appendMarkdown(` Line: \`${sentenceID}\`\n\n`);

        md.appendMarkdown('\n\n---\n');

        const actionLinks = unique.map(color => {
            const args = encodeURIComponent(JSON.stringify([color]));
            const count = byColor.get(color) || 0;
            return `[$(link) Trace-Links (${color}) · ${count}](command:trace-viz.viz.jumpToCodeFromLine?${args})`;
        });
        md.appendMarkdown(actionLinks.join('  |  '));
        return md;
    }

    private provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];
        if (!this.documentationPath) {
            return lenses;
        }
        if (path.resolve(document.uri.fsPath) !== path.resolve(this.documentationPath)) {
            return lenses;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.fsPath !== document.uri.fsPath) {
            return lenses;
        }
        const lineIndex = editor.selection.active.line;
        const sentenceID = lineIndex + 1;
        const links = this.lineToLinks[sentenceID];
        if (!links || links.length === 0) {
            return lenses;
        }

        const byColor = new Map<VizColor, number>();
        for (const l of links) {
            byColor.set(l.color, (byColor.get(l.color) || 0) + 1);
        }
        for (const [color, count] of byColor.entries()) {
            const range = new vscode.Range(lineIndex, 0, lineIndex, 0);
            const title = `Trace-Links (${color}) · ${count}`;
            const command: vscode.Command = {
                title,
                command: 'trace-viz.viz.jumpToCodeFromLine',
                arguments: [color]
            };
            lenses.push(new vscode.CodeLens(range, command));
        }
        return lenses;
    }
}
