import * as vscode from 'vscode';
import * as fs from 'fs';
import { getTraceHistory } from '../traceabilityApproach/csv/csvDirect';
import { VizColor, TraceHistoryEntry } from '../types';
import { DecorationService } from '../services/decoration.service';
import { CsvReaderService } from '../services/csvReader.service';
import { HistoryReaderService } from '../services/historyReader.service';
import { TraceComparisonService, EvaluationMetrics, SetSummary } from '../services/traceComparison.service';
import { dotMarkdown, toVizColor } from '../visualization/palette';
import { toUri } from '../utils/uri.util';

/** Statistics shown for a history entry */
interface HistoryItemStats {
    /** Size of the set */
    summary?: SetSummary;
    /** Whether the set is a gold standard */
    isGoldStandard?: boolean;
    /** Evaluation against the active gold standard (for sets that are not a gold standard) */
    evaluation?: { goldName: string; metrics: EvaluationMetrics };
}

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

            const stats = this.computeStats(history, vscode.workspace.workspaceFolders[0].uri.fsPath);
            return Promise.resolve(history.map(entry =>
                new HistoryItem(
                    HistoryReaderService.displayName(entry),
                    vscode.TreeItemCollapsibleState.None,
                    entry.originalName,
                    entry.csvPath,
                    entry.status,
                    entry.id,
                    entry.active,
                    entry.color as VizColor,
                    entry.timestamp,
                    entry.approach,
                    stats.get(entry.id)
                )
            ));
        }
        return Promise.resolve([]);
    }

    /** Stats per csvPath, valid while the file and the comparison context are unchanged */
    private readonly statsCache = new Map<string, { fileSignature: string; context: string; stats: HistoryItemStats | undefined }>();

    /** Identifies the content state of a file (mtime and size), or undefined if it cannot be read */
    private static fileSignature(csvPath: string): string | undefined {
        try {
            const stat = fs.statSync(csvPath);
            return `${stat.mtimeMs}:${stat.size}`;
        } catch {
            return undefined;
        }
    }

    /**
     * Computes the size of every completed set and, if exactly one active set is a gold standard,
     * the precision, recall and F1 of every other set against it. Results are cached per CSV file; an
     * entry is recomputed when its file changes or when the gold standard (or workspace) changes.
     */
    private computeStats(history: TraceHistoryEntry[], workspaceRoot: string): Map<string, HistoryItemStats> {
        const stats = new Map<string, HistoryItemStats>();
        const completed = history.filter(e => e.csvPath && e.status !== 'loading' && e.status !== 'error');
        const signatures = new Map(completed.map(e => [e.id, TraceHistoryViewProvider.fileSignature(e.csvPath)]));

        const activeGold = completed.filter(e => e.active && HistoryReaderService.isGoldStandard(e));
        const gold = activeGold.length === 1 ? activeGold[0] : undefined;
        const goldContext = gold ? `${gold.id}|${gold.csvPath}|${signatures.get(gold.id)}` : '';
        let goldLinks: ReturnType<typeof TraceComparisonService.toComparableLinks> | undefined;

        const livePaths = new Set(completed.map(e => e.csvPath));
        for (const cached of [...this.statsCache.keys()]) {
            if (!livePaths.has(cached)) {
                this.statsCache.delete(cached);
            }
        }

        for (const entry of completed) {
            const isGoldStandard = HistoryReaderService.isGoldStandard(entry);
            const fileSignature = signatures.get(entry.id);
            // The gold standard only matters for sets that are evaluated against it
            const context = `${workspaceRoot}|${isGoldStandard}|${isGoldStandard ? '' : goldContext}`;
            let cached = fileSignature !== undefined ? this.statsCache.get(entry.csvPath) : undefined;
            if (!cached || cached.fileSignature !== fileSignature || cached.context !== context) {
                const entryRows = CsvReaderService.readCsv(entry.csvPath);
                let item: HistoryItemStats | undefined;
                if (entryRows.length > 0) {
                    item = { summary: TraceComparisonService.summarize(entryRows, workspaceRoot), isGoldStandard };
                    if (gold && !isGoldStandard) {
                        goldLinks ??= TraceComparisonService.toComparableLinks(CsvReaderService.readCsv(gold.csvPath), workspaceRoot);
                        item.evaluation = {
                            goldName: HistoryReaderService.displayName(gold),
                            metrics: TraceComparisonService.evaluate(goldLinks, TraceComparisonService.toComparableLinks(entryRows, workspaceRoot))
                        };
                    }
                }
                cached = { fileSignature: fileSignature ?? '', context, stats: item };
                if (fileSignature !== undefined) {
                    this.statsCache.set(entry.csvPath, cached);
                }
            }
            if (cached.stats) {
                stats.set(entry.id, cached.stats);
            }
        }
        return stats;
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
        public readonly timestamp?: string,
        public readonly approach?: string,
        public readonly stats?: HistoryItemStats
    ) {
        super(label, collapsibleState);
        this.contextValue = 'traceViz.historyItem';
        this.tooltip = this.buildTooltip();
        // Subtitle: compact set summary, else the timestamp
        this.description = this.buildDescription() ?? timestamp;

        // Add status icon
        if (status === 'loading') {
            this.iconPath = new vscode.ThemeIcon('loading~spin');
            this.description = `${timestamp ?? ''} • Loading...`;
        } else if (status === 'error') {
            this.iconPath = new vscode.ThemeIcon('x', new vscode.ThemeColor('charts.red'));
            this.description = `${timestamp ?? ''} • Error`;
        } else if (status === 'completed') {
            this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
        }

        // Single-click: open documentation
        this.command = {
            command: 'trace-viz.openDocumentation',
            title: 'Open Documentation',
            arguments: [this.historyId]
        };

        const baseContext = this.active ? 'traceViz.historyItem-active' : 'traceViz.historyItem-inactive';
        if (this.label) {
            const lbl = (this.approach ?? this.label).toLowerCase();
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
        if (this.active && this.color) {
            this.iconPath = DecorationService.createCircleIconUri(toVizColor(this.color));
        }

        // Pass the item itself to commands so handlers can read historyId
        (this as any).historyId = this.historyId;
        // Ensure resourceUri is set so commands can resolve csvPath directly
        this.resourceUri = this.csvPath ? toUri(this.csvPath) : undefined;
    }

    /** Compact summary, e.g. "134 links · 27 sentences · F1 0.28" */
    private buildDescription(): string | undefined {
        const s = this.stats?.summary;
        if (!s) {
            return undefined;
        }
        const parts = [`${s.links} links`, `${s.sentences} sentences`];
        if (this.stats?.evaluation) {
            parts.push(`F1 ${TraceComparisonService.formatRatio(this.stats.evaluation.metrics.f1)}`);
        } else if (this.stats?.isGoldStandard) {
            parts.push('gold standard');
        }
        return parts.join(' · ');
    }

    private buildTooltip(): vscode.MarkdownString | string | undefined {
        if (!this.historyId) {
            return undefined;
        }
        const md = new vscode.MarkdownString(undefined, true);
        const esc = (t: string) => t.replace(/[\\`*_{}\[\]()#+!|<>~$]/g, '\\$&');
        const dot = this.active && this.color ? `${dotMarkdown(toVizColor(this.color))} ` : '';
        md.appendMarkdown(`${dot}**${esc(this.label)}**${this.stats?.isGoldStandard && !/gold/i.test(this.label) ? ' *(gold standard)*' : ''}\n\n`);
        const origin = [this.approach, this.originalName].filter((p): p is string => !!p).map(esc).join(' · ');
        if (origin) {
            md.appendMarkdown(`${origin}  \n`);
        }
        if (this.timestamp) {
            md.appendMarkdown(`${esc(this.timestamp)}  \n`);
        }
        md.appendMarkdown(this.active ? `Visualized in ${this.color ?? 'blue'}\n\n` : 'Not visualized\n\n');

        const s = this.stats?.summary;
        if (s) {
            md.appendMarkdown(`---\n\n**${s.links}** links · **${s.sentences}** documentation sentences · **${s.files}** code files\n\n`);
        }
        const e = this.stats?.evaluation;
        if (e) {
            const m = e.metrics;
            md.appendMarkdown(`---\n\nAgainst ${esc(e.goldName)}:  \n`);
            md.appendMarkdown(`Precision **${TraceComparisonService.formatRatio(m.precision)}** · Recall **${TraceComparisonService.formatRatio(m.recall)}** · F1 **${TraceComparisonService.formatRatio(m.f1)}**  \n`);
            md.appendMarkdown(`TP ${m.truePositives} · FP ${m.falsePositives} of ${m.approachLinks} links · FN ${m.falseNegatives} of ${m.goldLinks} gold links\n`);
        }
        return md;
    }
}
