import * as vscode from 'vscode';
import * as path from 'path';
import { VizColor, ActiveHistoryItem, LineAggregation, FileToLineAggregation, CsvLinkRow } from '../types';
import { CsvReaderService } from '../services/csvReader.service';
import { HistoryReaderService } from '../services/historyReader.service';
import { ConfigReaderService } from '../services/configReader.service';
import { PathResolverService } from '../services/pathResolver.service';
import { DecorationService } from '../services/decoration.service';
import { FileWatcherService } from '../services/fileWatcher.service';
import { FileToLineAggregationService } from '../services/fileToLineAggregation.service';
import { TraceComparisonService, LineComparison, EvaluationMetrics, ComparableLink } from '../services/traceComparison.service';
import { TraceFileDecorationProvider } from './explorerDecorations';
import { VIZ_COLORS, dotIconUri, dotMarkdown } from './palette';
import { toUri } from '../utils/uri.util';

/** Command that toggles the markers of documentation lines without trace links */
const TOGGLE_UNLINKED_COMMAND = 'trace-viz.toggleUnlinkedSentences';
/** Context key that is true while the unlinked-sentence markers are shown */
const UNLINKED_CONTEXT_KEY = 'traceViz.unlinkedSentencesVisible';
/** Overview ruler lanes of the first and second active set */
const SET_LANES = [vscode.OverviewRulerLane.Left, vscode.OverviewRulerLane.Center];
/** Maximum number of code paths listed per section (set or comparison category) of a hover */
const HOVER_MAX_FILES = 4;
/** Maximum number of code paths listed in a whole hover; the rest is reachable via "+K more…" (Quick Pick) */
const HOVER_MAX_TOTAL = 8;

/** Collapses whitespace and truncates text to the given length */
function truncate(text: string, max: number): string {
    const t = text.replace(/\s+/g, ' ').trim();
    return t.length > max ? t.substring(0, max - 1).trimEnd() + '…' : t;
}

/** Escapes characters that would break Markdown link text */
function escapeMd(text: string): string {
    return text.replace(/[\\`*_{}\[\]()#+!|<>~$]/g, '\\$&');
}

function plural(count: number, word: string): string {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Counts code links in their own unit. A link to a folder is one link that stands for all files below
 * it (directory heuristic), so it is counted as a folder, not as a file: "1 folder", "5 files", "2 files, 1 folder".
 * Every count shown for a set or a comparison category (CodeLens, hover, comparison summary) uses this rule,
 * so the numbers add up to the entries listed in the hover and the Quick Pick. A comparison category lists
 * links of one set: "in both" and "only <approach>" list the approach's links, "only <gold standard>" the gold links.
 * @param codeIDs Code paths of the links (duplicates are counted once)
 */
function describeLinks(codeIDs: Iterable<string>): string {
    let files = 0;
    let folders = 0;
    for (const codeID of new Set(codeIDs)) {
        if (PathResolverService.resolvePathType(codeID).isDir) {
            folders++;
        } else {
            files++;
        }
    }
    return [files > 0 ? plural(files, 'file') : '', folders > 0 ? plural(folders, 'folder') : ''].filter(Boolean).join(', ') || '0 files';
}

/** Command URI for Markdown links */
function commandUri(command: string, args: unknown[]): string {
    return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
}

/** A trace link set (one active history entry) */
interface TraceSet {
    id: string;
    /** Display name (label, else approach and original name) */
    name: string;
    /** Name without trailing parenthetical, for compact places */
    shortName: string;
    color: VizColor;
    isGoldStandard: boolean;
}

/**
 * Comparison of the two active sets. The reference is the gold standard if exactly one of the
 * sets is a gold standard (then `evaluation` holds precision, recall and F1), else the first set.
 */
interface SetComparison {
    reference: TraceSet;
    candidate: TraceSet;
    lines: Map<number, LineComparison>;
    evaluation?: EvaluationMetrics;
}

/** The three comparison categories of a link */
type Category = 'agreed' | 'candidateOnly' | 'referenceOnly';
const CATEGORIES: Category[] = ['agreed', 'candidateOnly', 'referenceOnly'];

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
 * Displays gutter dots, overview ruler marks, status bar items, code lenses and hover messages
 * for lines in the documentation file that have trace links to code, explorer badges for linked
 * files, and compares two active sets (or an approach with a gold standard) line by line.
 * Also supports reverse navigation: shows status bar items in code files linking back to documentation lines.
 */
class LineToFileVisualization implements vscode.Disposable {
    private statusBarItemsBySet: Map<string, vscode.StatusBarItem> = new Map();
    private fileToLineStatusBarItemsBySet: Map<string, vscode.StatusBarItem> = new Map();
    private compositeDecorations = new Map<string, vscode.TextEditorDecorationType>();
    private overviewDecorations = new Map<string, vscode.TextEditorDecorationType>();
    private unlinkedDecoration = DecorationService.createUnlinkedLineDecoration();
    private fileDecorations = new TraceFileDecorationProvider();
    private disposables: vscode.Disposable[] = [];
    private lineToLinks: LineAggregation = {};
    private fileToLines: FileToLineAggregation = {};
    private sets: TraceSet[] = [];
    private comparison: SetComparison | undefined;
    private showUnlinked = false;
    private documentationPath: string | undefined;
    private workspaceRoot: string | undefined;
    private codeLensEmitter = new vscode.EventEmitter<void>();

    /** Status bar item of a set (created on demand, one per set id; earlier sets are placed further left) */
    private statusBarItemFor(items: Map<string, vscode.StatusBarItem>, kind: 'doc' | 'code', set: TraceSet): vscode.StatusBarItem {
        let item = items.get(set.id);
        if (!item) {
            const index = Math.max(0, this.sets.findIndex(s => s.id === set.id));
            const base = kind === 'doc' ? 99 : 89;
            item = vscode.window.createStatusBarItem(`traceViz.${kind}.${set.id}`, vscode.StatusBarAlignment.Right, base - index);
            item.name = kind === 'doc' ? 'TraceViz: linked code' : 'TraceViz: linked documentation';
            items.set(set.id, item);
        }
        return item;
    }

    /** Disposes the status bar items of sets that are no longer active */
    private pruneStatusBarItems(): void {
        for (const items of [this.statusBarItemsBySet, this.fileToLineStatusBarItemsBySet]) {
            for (const [id, item] of [...items]) {
                if (!this.sets.some(s => s.id === id)) {
                    item.dispose();
                    items.delete(id);
                }
            }
        }
    }

    public initialize(): void {
        this.disposables.push(
            vscode.commands.registerCommand('trace-viz.viz.jumpToCodeFromLine', (setId?: string, sentenceID?: number) => this.onJumpToCode(setId, sentenceID)),
            vscode.commands.registerCommand('trace-viz.viz.jumpToLineFromFile', (setId?: string) => this.onJumpToLine(setId)),
            vscode.commands.registerCommand('trace-viz.viz.openCode', (codeID: string) => PathResolverService.openCodePath(codeID)),
            vscode.commands.registerCommand(TOGGLE_UNLINKED_COMMAND, () => this.toggleUnlinkedSentences())
        );
        void vscode.commands.executeCommand('setContext', UNLINKED_CONTEXT_KEY, this.showUnlinked);

        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.refreshRender()),
            vscode.window.onDidChangeVisibleTextEditors(() => this.refreshRender()),
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
        // Use the scheme of the workspace (file on desktop, a virtual file system in VS Code for the Web)
        const scheme = vscode.workspace.workspaceFolders?.[0]?.uri.scheme ?? 'file';
        this.disposables.push(vscode.languages.registerCodeLensProvider({ scheme }, provider));

        // Explorer badges for linked files and folders
        this.disposables.push(vscode.window.registerFileDecorationProvider(this.fileDecorations));

        // Set up file watchers
        const watchers = FileWatcherService.createTraceVizWatchers(() => this.reloadData());
        this.disposables.push(...watchers);

        this.reloadData();
    }

    public dispose(): void {
        for (const item of this.statusBarItemsBySet.values()) {
            item.dispose();
        }
        for (const item of this.fileToLineStatusBarItemsBySet.values()) {
            item.dispose();
        }
        this.compositeDecorations.forEach(d => d.dispose());
        this.overviewDecorations.forEach(d => d.dispose());
        this.unlinkedDecoration.dispose();
        this.fileDecorations.dispose();
        this.codeLensEmitter.dispose();
        this.disposables.forEach(d => d.dispose());
    }

    private setById(id: string, color?: VizColor): TraceSet {
        const name = color ? `${color} set` : id;
        return this.sets.find(s => s.id === id) ?? { id, name, shortName: name, color: color ?? 'blue', isGoldStandard: false };
    }

    private reloadData(): void {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        this.workspaceRoot = workspaceFolder?.uri.fsPath;

        const activeItems = HistoryReaderService.readActiveHistoryItems();
        // The ARDoCo configuration names the documentation file; without it (e.g. a CSV Direct import alone) use
        // the one stored on the active history entries. Only one documentation file is decorated: if the active
        // entries point to different files, the first entry's file wins.
        this.documentationPath = ConfigReaderService.readDocumentationPath()
            ?? activeItems.find(i => i.documentationPath)?.documentationPath;
        this.sets = activeItems.map(i => ({
            id: i.id,
            name: i.name,
            shortName: HistoryReaderService.shortName(i.name),
            color: i.color,
            isGoldStandard: i.isGoldStandard
        }));
        const rowsBySet = new Map<string, CsvLinkRow[]>(activeItems.map(i => [i.id, CsvReaderService.readCsv(i.csvPath)]));
        this.lineToLinks = this.aggregateLinks(activeItems, rowsBySet);
        this.comparison = this.compareSets(rowsBySet);

        if (this.workspaceRoot) {
            this.fileToLines = FileToLineAggregationService.aggregateFileToLines(activeItems, this.workspaceRoot);
        } else {
            this.fileToLines = {};
        }
        this.fileDecorations.update(this.fileToLines, this.sets, this.workspaceRoot);

        this.refreshRender();
        this.codeLensEmitter.fire();
    }

    /**
     * Aggregates links from active history items by sentence ID (line-to-file specific)
     */
    private aggregateLinks(items: ActiveHistoryItem[], rowsBySet: Map<string, CsvLinkRow[]>): LineAggregation {
        const agg: LineAggregation = {};
        for (const item of items) {
            for (const row of rowsBySet.get(item.id) ?? []) {
                if (!agg[row.sentenceID]) {
                    agg[row.sentenceID] = [];
                }
                agg[row.sentenceID].push({ codeID: row.codeID, color: item.color, sourceId: item.id });
            }
        }
        return agg;
    }

    /**
     * Compares the two active sets line by line (see TraceComparisonService for the matching rule).
     * If exactly one of them is a gold standard, it is the reference and the other set is evaluated against it.
     */
    private compareSets(rowsBySet: Map<string, CsvLinkRow[]>): SetComparison | undefined {
        if (this.sets.length < 2) {
            return undefined;
        }
        const [first, second] = this.sets;
        const gold = [first, second].filter(s => s.isGoldStandard);
        const reference = gold.length === 1 ? gold[0] : first;
        const candidate = reference === first ? second : first;
        const refLinks = TraceComparisonService.toComparableLinks(rowsBySet.get(reference.id) ?? [], this.workspaceRoot);
        const candLinks = TraceComparisonService.toComparableLinks(rowsBySet.get(candidate.id) ?? [], this.workspaceRoot);
        return {
            reference,
            candidate,
            lines: TraceComparisonService.compareLines(refLinks, candLinks),
            evaluation: gold.length === 1 ? TraceComparisonService.evaluate(refLinks, candLinks) : undefined
        };
    }

    // ------------------------------------------------------------------------
    // Naming (shared by hover, CodeLens, status bar and Quick Pick)
    // ------------------------------------------------------------------------

    /** Label of a comparison category, e.g. "Only ArDoCode (FP)" */
    private categoryLabel(c: SetComparison, category: Category): string {
        const gold = !!c.evaluation;
        switch (category) {
            case 'agreed':
                return gold ? 'In both (TP)' : 'In both';
            case 'candidateOnly':
                return `Only ${c.candidate.shortName}${gold ? ' (FP)' : ''}`;
            case 'referenceOnly':
                return `Only ${c.reference.shortName}${gold ? ' (FN)' : ''}`;
        }
    }

    /** Dot colors of a comparison category */
    private categoryColors(c: SetComparison, category: Category): VizColor[] {
        switch (category) {
            case 'agreed':
                return this.sets.filter(s => s === c.reference || s === c.candidate).map(s => s.color);
            case 'candidateOnly':
                return [c.candidate.color];
            case 'referenceOnly':
                return [c.reference.color];
        }
    }

    /** Compact comparison of a line, e.g. "2 in both (TP) · 8 only ArDoCode (FP)" */
    private comparisonSummary(c: SetComparison, line: LineComparison): string {
        return CATEGORIES
            .filter(cat => line[cat].length > 0)
            .map(cat => {
                const label = this.categoryLabel(c, cat);
                return `${describeLinks(line[cat].map(l => l.codeID))} ${label.charAt(0).toLowerCase()}${label.substring(1)}`;
            })
            .join(' · ');
    }

    /** One-line evaluation, e.g. "ArDoCode vs. Gold standard: P 0.20 · R 0.44 · F1 0.28" */
    private evaluationSummary(c: SetComparison): string | undefined {
        return c.evaluation ? `${c.candidate.shortName} vs. ${c.reference.shortName}: ${TraceComparisonService.formatMetrics(c.evaluation)}` : undefined;
    }

    /** Markdown legend: one colored dot and name per active set */
    private legendMarkdown(): string {
        return this.sets.map(s => `${dotMarkdown(s.color)} ${escapeMd(s.name)}${this.goldMarker(s)}`).join(' &nbsp; ');
    }

    /** " (gold standard)" for the reference gold standard, unless its name already says so */
    private goldMarker(set: TraceSet): string {
        return set.isGoldStandard && this.comparison?.evaluation && !/gold/i.test(set.name) ? ' *(gold standard)*' : '';
    }

    // ------------------------------------------------------------------------
    // Documentation editor rendering
    // ------------------------------------------------------------------------

    private refreshRender(): void {
        this.updateStatusBar();
        for (const editor of vscode.window.visibleTextEditors) {
            if (this.isDocumentationEditor(editor)) {
                this.renderDocumentationEditor(editor);
            }
        }
        this.codeLensEmitter.fire();
    }

    private renderDocumentationEditor(editor: vscode.TextEditor): void {
        const doc = editor.document;
        const gutter = new Map<string, { colors: VizColor[]; options: vscode.DecorationOptions[] }>();
        const overview = new Map<string, vscode.Range[]>();
        const unlinked: vscode.DecorationOptions[] = [];

        for (let lineIndex = 0; lineIndex < doc.lineCount; lineIndex++) {
            const sentenceID = lineIndex + 1;
            const links = this.lineToLinks[sentenceID];
            const range = doc.lineAt(lineIndex).range;
            if (!links || links.length === 0) {
                if (this.showUnlinked && this.sets.length > 0 && !doc.lineAt(lineIndex).isEmptyOrWhitespace) {
                    unlinked.push({ range });
                }
                continue;
            }
            // Gutter: one composite dot icon per color combination (at most two sets are active)
            const colors = this.sets.map(s => s.color).filter(c => links.some(l => l.color === c));
            const key = [...colors].sort().join('+');
            const entry = gutter.get(key) ?? { colors, options: [] };
            entry.options.push({ range, hoverMessage: this.buildHover(sentenceID) });
            gutter.set(key, entry);

            // Overview ruler: one lane per set
            this.sets.forEach((set, i) => {
                if (links.some(l => l.sourceId === set.id)) {
                    const lane = SET_LANES[i] ?? vscode.OverviewRulerLane.Full;
                    const k = `${set.color}:${lane}`;
                    overview.set(k, [...(overview.get(k) ?? []), range]);
                }
            });
        }

        for (const [key, { colors, options }] of gutter) {
            editor.setDecorations(this.getCompositeDecoration(key, colors), options);
        }
        for (const [key, deco] of this.compositeDecorations) {
            if (!gutter.has(key)) {
                editor.setDecorations(deco, []);
            }
        }

        for (const [key, ranges] of overview) {
            const [color, lane] = key.split(':');
            let deco = this.overviewDecorations.get(key);
            if (!deco) {
                deco = DecorationService.createOverviewRulerMark(color as VizColor, Number(lane) as vscode.OverviewRulerLane);
                this.overviewDecorations.set(key, deco);
            }
            editor.setDecorations(deco, ranges);
        }
        for (const [key, deco] of this.overviewDecorations) {
            if (!overview.has(key)) {
                editor.setDecorations(deco, []);
            }
        }

        const unlinkedHover = new vscode.MarkdownString(`**No trace links** in ${this.sets.map(s => escapeMd(s.name)).join(' or ')}`);
        editor.setDecorations(this.unlinkedDecoration, unlinked.map(o => ({ ...o, hoverMessage: unlinkedHover })));
    }

    private getCompositeDecoration(key: string, colors: VizColor[]): vscode.TextEditorDecorationType {
        let deco = this.compositeDecorations.get(key);
        if (!deco) {
            deco = DecorationService.createCompositeDecoration(colors);
            this.compositeDecorations.set(key, deco);
        }
        return deco;
    }

    private toggleUnlinkedSentences(): void {
        this.showUnlinked = !this.showUnlinked;
        void vscode.commands.executeCommand('setContext', UNLINKED_CONTEXT_KEY, this.showUnlinked);
        this.refreshRender();
        vscode.window.setStatusBarMessage(`TraceViz: ${this.showUnlinked ? 'marking' : 'no longer marking'} documentation sentences without trace links`, 3000);
    }

    /**
     * Checks if the editor is showing the documentation file (line-to-file specific)
     */
    private isDocumentationEditor(editor: vscode.TextEditor): boolean {
        return this.isDocumentation(editor.document);
    }

    private isDocumentation(document: vscode.TextDocument): boolean {
        if (!this.documentationPath) {
            return false;
        }
        try {
            return path.resolve(document.uri.fsPath) === path.resolve(this.documentationPath);
        } catch {
            return false;
        }
    }

    // ------------------------------------------------------------------------
    // Hover
    // ------------------------------------------------------------------------

    private buildHover(sentenceID: number): vscode.MarkdownString {
        const md = new vscode.MarkdownString(undefined, true);
        md.isTrusted = true;
        md.supportHtml = true;
        const linksOnLine = this.lineToLinks[sentenceID] || [];
        const linkingSets = this.sets.filter(s => linksOnLine.some(l => l.sourceId === s.id));
        const c = this.comparison;
        const displayNames = this.fileDisplayNames(linksOnLine.map(l => l.codeID));

        let linkedBy = '';
        if (this.sets.length > 1) {
            linkedBy = linkingSets.length === this.sets.length ? ' · linked by both sets' : ` · only ${escapeMd(linkingSets.map(s => s.shortName).join(', '))}`;
        }
        md.appendMarkdown(`**Trace links** | Line ${sentenceID}${linkedBy}\n\n`);
        if (this.sets.length > 1) {
            md.appendMarkdown(this.legendMarkdown() + '\n\n---\n\n');
        }

        // Dense lines would make the hover taller than the editor and clip its end, so the overall
        // evaluation comes first and the number of listed paths is capped (HOVER_MAX_FILES per section,
        // HOVER_MAX_TOTAL overall); the remainder is behind "+K more…", which opens the Quick Pick of the line.
        let budget = HOVER_MAX_TOTAL;
        const line = c?.lines.get(sentenceID);
        if (c && line) {
            const evaluation = this.evaluationSummary(c);
            if (evaluation) {
                md.appendMarkdown(`*Overall: ${escapeMd(evaluation)}*\n\n---\n\n`);
            }
            for (const category of CATEGORIES) {
                if (line[category].length > 0) {
                    const files = line[category].map(l => l.codeID);
                    md.appendMarkdown(`${dotMarkdown(this.categoryColors(c, category))} **${escapeMd(this.categoryLabel(c, category))}** · ${describeLinks(files)}  \n`);
                    budget -= this.appendFileList(md, files, displayNames, sentenceID, undefined, budget);
                }
            }
            return md;
        }

        for (const group of this.groupBySet(linksOnLine)) {
            const files = [...new Set(group.links.map(l => l.codeID))];
            md.appendMarkdown(`${dotMarkdown(group.set.color)} **${escapeMd(group.set.name)}** · ${describeLinks(files)}  \n`);
            budget -= this.appendFileList(md, files, displayNames, sentenceID, group.set.id, budget);
        }
        return md;
    }

    /** Short display names of code paths: the base name, plus the parent folder where base names repeat */
    private fileDisplayNames(codeIDs: string[]): Map<string, string> {
        const trimmed = (f: string) => f.replace(/[\\/]+$/, '');
        const counts = new Map<string, Set<string>>();
        for (const f of codeIDs) {
            const base = path.basename(trimmed(f));
            counts.set(base, (counts.get(base) ?? new Set()).add(trimmed(f)));
        }
        const names = new Map<string, string>();
        for (const f of codeIDs) {
            const t = trimmed(f);
            const base = path.basename(t) || f;
            names.set(f, (counts.get(base)?.size ?? 0) > 1 ? `${path.basename(path.dirname(t))}/${base}` : base);
        }
        return names;
    }

    /**
     * Appends a compact, wrapping list of code links (at most HOVER_MAX_FILES and at most `budget`, then a link to the Quick Pick)
     * @returns Number of code paths listed
     */
    private appendFileList(md: vscode.MarkdownString, codeIDs: string[], displayNames: Map<string, string>, sentenceID: number, setId: string | undefined, budget: number): number {
        const limit = Math.max(0, Math.min(HOVER_MAX_FILES, budget));
        const shown = codeIDs.slice(0, limit).map(f =>
            `[$(${PathResolverService.resolvePathType(f).isDir ? 'folder' : 'file'}) ${escapeMd(displayNames.get(f) ?? f)}](${commandUri('trace-viz.viz.openCode', [f])} "${f.replace(/"/g, '')}")`);
        if (codeIDs.length > limit) {
            shown.push(`[+${codeIDs.length - limit} more…](${commandUri('trace-viz.viz.jumpToCodeFromLine', [setId ?? null, sentenceID])} "Show all")`);
        }
        md.appendMarkdown(shown.join(' &nbsp;·&nbsp; ') + '\n\n');
        return Math.min(limit, codeIDs.length);
    }

    // ------------------------------------------------------------------------
    // Status bar
    // ------------------------------------------------------------------------

    private updateStatusBar(): void {
        // Hide all by default
        this.pruneStatusBarItems();
        for (const item of this.statusBarItemsBySet.values()) {
            item.hide();
        }
        for (const item of this.fileToLineStatusBarItemsBySet.values()) {
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
            for (const group of this.groupBySet(links)) {
                const item = this.statusBarItemFor(this.statusBarItemsBySet, 'doc', group.set);
                const count = new Set(group.links.map(l => l.codeID)).size;
                item.text = `$(link) ${count} · ${truncate(group.set.shortName, 24)}`;
                item.tooltip = this.statusTooltip(group.set, `${plural(count, 'linked code location')} for line ${lineNumber}. Click to choose one.`);
                item.command = { title: 'Jump to linked code', command: 'trace-viz.viz.jumpToCodeFromLine', arguments: [group.set.id] };
                item.show();
            }
            return;
        }

        // Check if we're in a code file with trace links
        if (this.workspaceRoot) {
            const filePath = path.normalize(editor.document.uri.fsPath);
            const links = FileToLineAggregationService.getLinksForFile(filePath, this.fileToLines);
            for (const group of this.groupBySet(links)) {
                const item = this.statusBarItemFor(this.fileToLineStatusBarItemsBySet, 'code', group.set);
                const count = new Set(group.links.map(l => l.sentenceID)).size;
                item.text = `$(book) ${count} · ${truncate(group.set.shortName, 24)}`;
                item.tooltip = this.statusTooltip(group.set, `${plural(count, 'linked documentation sentence')}. Click to choose one.`);
                item.command = { title: 'Jump to linked documentation', command: 'trace-viz.viz.jumpToLineFromFile', arguments: [group.set.id] };
                item.show();
            }
        }
    }

    private statusTooltip(set: TraceSet, text: string): vscode.MarkdownString {
        const md = new vscode.MarkdownString(undefined, true);
        md.appendMarkdown(`${dotMarkdown(set.color)} **${escapeMd(set.name)}**${this.goldMarker(set)}\n\n${escapeMd(text)}`);
        const evaluation = this.comparison ? this.evaluationSummary(this.comparison) : undefined;
        if (evaluation && this.comparison?.evaluation) {
            const m = this.comparison.evaluation;
            md.appendMarkdown(`\n\n---\n\n${escapeMd(evaluation)}  \nTP ${m.truePositives} · FP ${m.falsePositives} of ${m.approachLinks} links · FN ${m.falseNegatives} of ${m.goldLinks} gold links`);
        }
        return md;
    }

    // ------------------------------------------------------------------------
    // Quick Picks
    // ------------------------------------------------------------------------

    private async onJumpToCode(setId?: string, sentenceID?: number): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !this.isDocumentationEditor(editor)) {
            return;
        }
        const lineNumber = typeof sentenceID === 'number' ? sentenceID : editor.selection.active.line + 1;
        let links = this.lineToLinks[lineNumber] || [];
        if (setId) {
            links = links.filter(l => l.sourceId === setId);
        }
        if (links.length === 0) {
            return;
        }

        type CodeItem = vscode.QuickPickItem & { codeID?: string };
        const codeItem = (codeID: string, colors: VizColor[]): CodeItem => {
            const info = PathResolverService.resolvePathType(codeID);
            const trimmed = codeID.replace(/\/+$/, '');
            const dir = path.dirname(trimmed);
            return {
                label: `${info.isDir ? '$(folder)' : '$(file)'} ${path.basename(trimmed) || codeID}`,
                description: dir === '.' || dir === '/' ? '' : dir.replace(/^\/+/, ''),
                iconPath: dotIconUri(colors),
                codeID
            };
        };

        const items: CodeItem[] = [];
        const c = this.comparison;
        const line = c?.lines.get(lineNumber);
        if (!setId && c && line) {
            // Both sets: group by comparison category
            for (const category of CATEGORIES) {
                if (line[category].length === 0) {
                    continue;
                }
                items.push({ label: this.categoryLabel(c, category), kind: vscode.QuickPickItemKind.Separator });
                const colors = this.categoryColors(c, category);
                items.push(...line[category].map((l: ComparableLink) => codeItem(l.codeID, colors)));
            }
        } else {
            const groups = this.groupBySet(links);
            for (const group of groups) {
                if (groups.length > 1) {
                    items.push({ label: group.set.name, kind: vscode.QuickPickItemKind.Separator });
                }
                for (const codeID of new Set(group.links.map(l => l.codeID))) {
                    items.push(codeItem(codeID, [group.set.color]));
                }
            }
        }

        const sentence = await this.readSentence(lineNumber);
        const setName = setId ? this.sets.find(x => x.id === setId)?.name : undefined;
        const picked = await vscode.window.showQuickPick(items, {
            title: `Code linked to line ${lineNumber}${setName ? ` · ${setName}` : ''}`,
            placeHolder: sentence ? truncate(sentence, 120) : undefined,
            matchOnDescription: true
        });
        if (!picked || !picked.codeID) {
            return;
        }
        await PathResolverService.openCodePath(picked.codeID);
    }

    /**
     * Handles jumping from a code file to linked documentation lines
     */
    private async onJumpToLine(setId?: string): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !this.documentationPath || !this.workspaceRoot) {
            return;
        }

        // Don't handle if we're in the documentation file itself
        if (this.isDocumentationEditor(editor)) {
            return;
        }

        const filePath = path.normalize(editor.document.uri.fsPath);
        const links = FileToLineAggregationService.getLinksForFile(filePath, this.fileToLines);

        // One entry per documentation sentence, with the sets linking it. The category (in both / only A / only B)
        // is derived from all sets, so the set filter only restricts which sentences are listed.
        const bySentence = this.setsBySentence(links);
        if (setId) {
            for (const [sentenceID, sets] of [...bySentence]) {
                if (!sets.some(s => s.id === setId)) {
                    bySentence.delete(sentenceID);
                }
            }
        }

        if (bySentence.size === 0) {
            return;
        }

        // If only one sentence is linked, jump directly
        if (bySentence.size === 1) {
            await this.jumpToDocumentationLine([...bySentence.keys()][0]);
            return;
        }

        const lines = await this.readDocumentationLines();
        const items = [...bySentence.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([sentenceID, sets]) => ({
                // Line number first, so it is never pushed out by a long sentence
                label: `Line ${sentenceID}`,
                description: this.setsDescription(sets),
                detail: truncate(lines?.[sentenceID - 1] ?? '', 200) || undefined,
                iconPath: dotIconUri(sets.map(s => s.color)),
                sentenceID
            }));

        const setName = setId ? this.sets.find(x => x.id === setId)?.name : undefined;
        const picked = await vscode.window.showQuickPick(items, {
            title: `Documentation sentences linked to ${path.basename(filePath)}${setName ? ` · ${setName}` : ''}`,
            placeHolder: 'Filter by line, set or sentence text',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (!picked) {
            return;
        }

        await this.jumpToDocumentationLine(picked.sentenceID);
    }

    /** Sets linking each sentence (in the order of the active sets) */
    private setsBySentence(links: Array<{ sentenceID: number; color: string; sourceId: string }>): Map<number, TraceSet[]> {
        const bySentence = new Map<number, TraceSet[]>();
        for (const l of links) {
            const list = bySentence.get(l.sentenceID) ?? [];
            const set = this.setById(l.sourceId, l.color as VizColor);
            if (!list.some(x => x.id === set.id)) {
                list.push(set);
            }
            bySentence.set(l.sentenceID, list);
        }
        for (const list of bySentence.values()) {
            list.sort((a, b) => this.sets.indexOf(a) - this.sets.indexOf(b));
        }
        return bySentence;
    }

    /**
     * Describes which sets link a sentence: the comparison category if two sets are compared
     * (e.g. "Only ArDoCode (FP)"), else the set names
     */
    private setsDescription(sets: TraceSet[]): string {
        const c = this.comparison;
        if (c && this.sets.length > 1) {
            const hasRef = sets.some(s => s.id === c.reference.id);
            const hasCand = sets.some(s => s.id === c.candidate.id);
            if (hasRef && hasCand) {
                return `${this.categoryLabel(c, 'agreed')}: ${c.reference.shortName}, ${c.candidate.shortName}`;
            }
            if (hasCand) {
                return this.categoryLabel(c, 'candidateOnly');
            }
            if (hasRef) {
                return this.categoryLabel(c, 'referenceOnly');
            }
        }
        return sets.map(s => s.name).join(' · ');
    }

    /** Reads all lines of the documentation file (undefined if it cannot be read) */
    private async readDocumentationLines(): Promise<string[] | undefined> {
        if (!this.documentationPath) {
            return undefined;
        }
        try {
            const doc = await vscode.workspace.openTextDocument(toUri(this.documentationPath));
            return doc.getText().split(/\r?\n/);
        } catch {
            return undefined;
        }
    }

    private async readSentence(sentenceID: number): Promise<string | undefined> {
        return (await this.readDocumentationLines())?.[sentenceID - 1];
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
            const docUri = toUri(this.documentationPath);
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

    /** Groups links by trace link set, in the order of the active sets */
    private groupBySet<T extends { sourceId: string; color: string }>(links: T[]): Array<{ set: TraceSet; links: T[] }> {
        const map = new Map<string, T[]>();
        for (const l of links) {
            const g = map.get(l.sourceId) ?? [];
            g.push(l);
            map.set(l.sourceId, g);
        }
        const ids = [...this.sets.map(s => s.id).filter(id => map.has(id)), ...[...map.keys()].filter(id => !this.sets.some(s => s.id === id))];
        return ids.map(id => ({ set: this.setById(id, map.get(id)![0].color as VizColor), links: map.get(id)! }));
    }

    // ------------------------------------------------------------------------
    // CodeLens
    // ------------------------------------------------------------------------

    private provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];
        if (!this.documentationPath) {
            return lenses;
        }
        if (!this.isDocumentation(document)) {
            return this.provideCodeFileLenses(document);
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
            return lenses;
        }
        const lineIndex = editor.selection.active.line;
        const sentenceID = lineIndex + 1;
        const links = this.lineToLinks[sentenceID];
        if (!links || links.length === 0) {
            return lenses;
        }

        const range = new vscode.Range(lineIndex, 0, lineIndex, 0);
        for (const group of this.groupBySet(links)) {
            const count = new Set(group.links.map(l => l.codeID)).size;
            lenses.push(new vscode.CodeLens(range, {
                title: `$(link) ${group.set.name} · ${describeLinks(group.links.map(l => l.codeID))}`,
                tooltip: `Choose one of the ${plural(count, 'code location')} that ${group.set.name} links to line ${sentenceID}. A folder link covers all files below it.`,
                command: 'trace-viz.viz.jumpToCodeFromLine',
                arguments: [group.set.id]
            }));
        }

        const c = this.comparison;
        const line = c?.lines.get(sentenceID);
        if (c && line) {
            lenses.push(new vscode.CodeLens(range, {
                title: `$(git-compare) ${this.comparisonSummary(c, line)}`,
                tooltip: `Compare ${c.candidate.name} with ${c.reference.name} on line ${sentenceID}. Counts are links; a folder link matches every file below it.`,
                command: 'trace-viz.viz.jumpToCodeFromLine',
                arguments: []
            }));
        }
        return lenses;
    }

    /** CodeLenses at the top of a code file that is linked to documentation sentences */
    private provideCodeFileLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (!this.workspaceRoot) {
            return [];
        }
        const links = FileToLineAggregationService.getLinksForFile(path.normalize(document.uri.fsPath), this.fileToLines);
        const range = new vscode.Range(0, 0, 0, 0);
        const lenses = this.groupBySet(links).map(group => {
            const count = new Set(group.links.map(l => l.sentenceID)).size;
            return new vscode.CodeLens(range, {
                title: `$(book) ${group.set.name} · ${plural(count, 'doc sentence')}`,
                tooltip: `Choose one of the ${plural(count, 'documentation sentence')} that ${group.set.name} links to this file`,
                command: 'trace-viz.viz.jumpToLineFromFile',
                arguments: [group.set.id]
            });
        });

        // Comparison of the two sets for this file, per linked sentence
        const c = this.comparison;
        if (c && lenses.length > 0) {
            const counts: Record<Category, number> = { agreed: 0, candidateOnly: 0, referenceOnly: 0 };
            for (const sets of this.setsBySentence(links).values()) {
                const hasRef = sets.some(s => s.id === c.reference.id);
                const hasCand = sets.some(s => s.id === c.candidate.id);
                counts[hasRef && hasCand ? 'agreed' : hasCand ? 'candidateOnly' : 'referenceOnly']++;
            }
            const summary = CATEGORIES
                .filter(cat => counts[cat] > 0)
                .map(cat => {
                    const label = this.categoryLabel(c, cat);
                    return `${counts[cat]} ${label.charAt(0).toLowerCase()}${label.substring(1)}`;
                })
                .join(' · ');
            lenses.push(new vscode.CodeLens(range, {
                title: `$(git-compare) ${summary}`,
                tooltip: `Documentation sentences linked to this file: ${c.candidate.name} compared with ${c.reference.name}`,
                command: 'trace-viz.viz.jumpToLineFromFile',
                arguments: []
            }));
        }
        return lenses;
    }
}
