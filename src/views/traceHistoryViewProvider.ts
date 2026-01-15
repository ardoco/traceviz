import * as vscode from 'vscode';
import { getTraceHistory } from '../traceabilityApproach/csv/csvDirect';
import { VizColor, TraceHistoryEntry } from '../types';

/**
 * Tree data provider for the Trace History view
 * Displays trace link generation history entries
 */
export class TraceHistoryViewProvider implements vscode.TreeDataProvider<HistoryItem>, vscode.Disposable {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<HistoryItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HistoryItem | undefined | null | void> = this.onDidChangeTreeDataEmitter.event;

    getTreeItem(element: HistoryItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: HistoryItem): Thenable<HistoryItem[]> {
        if (!element) {
            // Return history entries
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                return Promise.resolve([
                    new HistoryItem('No workspace open', vscode.TreeItemCollapsibleState.None)
                ]);
            }

            const history = getTraceHistory(vscode.workspace.workspaceFolders[0]);
            if (history.length === 0) {
                return Promise.resolve([
                    new HistoryItem('No trace history yet', vscode.TreeItemCollapsibleState.None)
                ]);
            }

            return Promise.resolve(history.map(entry => 
                new HistoryItem(
                    entry.approach,
                    vscode.TreeItemCollapsibleState.None,
                    entry.originalName,
                    entry.csvPath,
                    entry.status,
                    entry.id,
                    entry.active,
                    entry.color as VizColor,
                    entry.timestamp
                )
            ));
        }
        return Promise.resolve([]);
    }

    refresh(): void {
        this.onDidChangeTreeDataEmitter.fire();
    }

    dispose(): void {
        this.onDidChangeTreeDataEmitter.dispose();
    }
}

/**
 * Tree item representing a trace history entry
 */
export class HistoryItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly originalName?: string,
        public readonly csvPath?: string,
        public readonly status?: 'loading' | 'completed' | 'error',
        public readonly historyId?: string,
        public readonly active?: boolean,
        public readonly color?: VizColor,
        public readonly timestamp?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = 'traceViz.historyItem';
        this.tooltip = originalName ? `Original file: ${originalName}\n${timestamp ?? ''}` : timestamp;
        // Default subtitle: show timestamp if provided
        this.description = timestamp;
        
        // Add status icon
        if (status === 'loading') {
            this.iconPath = new vscode.ThemeIcon('loading~spin');
            this.description = `${timestamp ?? ''} • Loading...`;
        } else if (status === 'error') {
            this.iconPath = new vscode.ThemeIcon('x', new vscode.ThemeColor('charts.red'));
            this.description = `${timestamp ?? ''} • Error`;
        } else if (status === 'completed') {
            this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            this.description = timestamp;
        }
        
        // Single-click: open documentation
        this.command = {
            command: 'trace-viz.openDocumentation',
            title: 'Open Documentation',
            arguments: [this.historyId]
        };

        // View item actions
        const colorToThemeColor: Record<VizColor, string> = {
            blue: 'charts.blue',
            red: 'charts.red',
            orange: 'charts.orange',
            green: 'charts.green'
        };

        this.resourceUri = this.csvPath ? vscode.Uri.file(this.csvPath) : undefined;
        const baseContext = this.active ? 'traceViz.historyItem-active' : 'traceViz.historyItem-inactive';
        if (this.label) {
            const lbl = this.label.toLowerCase();
            if (lbl === 'sad-code') {
                this.contextValue = `${baseContext}-sadcode`;
            } else if (lbl === 'csv direct') {
                this.contextValue = `${baseContext}-csvdirect`;
            } else {
                this.contextValue = baseContext;
            }
        } else {
            this.contextValue = baseContext;
        }
        this.description = this.active ? `${timestamp ?? ''} | visualizing • ${this.color}` : this.description;
        if (this.active && this.color) {
            this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(colorToThemeColor[this.color]));
        }

        // Pass the item itself to commands so handlers can read historyId
        (this as any).historyId = this.historyId;
        // Ensure resourceUri is set so commands can resolve csvPath directly
        this.resourceUri = this.csvPath ? vscode.Uri.file(this.csvPath) : undefined;
    }
}


