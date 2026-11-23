import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileToLineAggregation, VizColor } from '../types';
import { toUri } from '../utils/uri.util';
import { themeColor } from './palette';

/** The parts of a trace link set that the explorer decorations need */
export interface DecoratedSet {
    id: string;
    name: string;
    color: VizColor;
}

/** Explorer badges hold at most two characters */
function badgeFor(count: number): string {
    return String(Math.min(count, 99));
}

function plural(count: number, word: string): string {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Marks files and folders in the explorer that are linked by an active trace link set.
 *
 * - Linked files and directly linked folders: a badge with the number of linked documentation
 *   sentences, colored in the set color. If several active sets link the item, the badge keeps the
 *   default color and the tooltip names the sets.
 * - Folders that only contain linked files: a dot badge (colored if a single set links all of them),
 *   so the way to linked files stays visible without coloring the whole tree.
 */
export class TraceFileDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
    private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this.emitter.event;
    private decorations = new Map<string, vscode.FileDecoration>();
    private decoratedUris: vscode.Uri[] = [];

    /**
     * Recomputes all decorations and notifies the explorer
     * @param fileToLines Links per absolute code path (with the directory heuristic applied)
     * @param sets Active trace link sets, in display order
     * @param workspaceRoot Root path of the workspace
     */
    update(fileToLines: FileToLineAggregation, sets: DecoratedSet[], workspaceRoot: string | undefined): void {
        const previous = this.decoratedUris;
        this.decorations = new Map();
        this.decoratedUris = [];

        if (workspaceRoot && sets.length > 0) {
            const root = path.normalize(workspaceRoot);
            const setOrder = (id: string) => {
                const i = sets.findIndex(s => s.id === id);
                return i < 0 ? sets.length : i;
            };
            // Linked files per folder and set, for the folder dots
            const folderFiles = new Map<string, Map<string, number>>();

            for (const [codePath, links] of Object.entries(fileToLines)) {
                if (!links || links.length === 0) {
                    continue;
                }
                const abs = path.normalize(codePath);
                let isDir: boolean;
                try {
                    if (!fs.existsSync(abs)) {
                        continue;
                    }
                    isDir = fs.statSync(abs).isDirectory();
                } catch {
                    continue;
                }

                const sentencesBySet = new Map<string, Set<number>>();
                for (const l of links) {
                    const s = sentencesBySet.get(l.sourceId) ?? new Set<number>();
                    s.add(l.sentenceID);
                    sentencesBySet.set(l.sourceId, s);
                }
                const setIds = [...sentencesBySet.keys()].sort((a, b) => setOrder(a) - setOrder(b));
                const allSentences = new Set(links.map(l => l.sentenceID));
                const parts = setIds.map(id => `${sets.find(s => s.id === id)?.name ?? id}: ${plural(sentencesBySet.get(id)!.size, 'sentence')}`);
                const single = setIds.length === 1 ? sets.find(s => s.id === setIds[0]) : undefined;
                this.set(abs, new vscode.FileDecoration(
                    badgeFor(allSentences.size),
                    `Trace links (${plural(allSentences.size, 'documentation sentence')}): ${parts.join(', ')}`,
                    single ? themeColor(single.color) : undefined
                ));

                if (!isDir) {
                    let dir = path.dirname(abs);
                    while (dir.length > root.length && dir.startsWith(root)) {
                        const counts = folderFiles.get(dir) ?? new Map<string, number>();
                        for (const id of setIds) {
                            counts.set(id, (counts.get(id) ?? 0) + 1);
                        }
                        folderFiles.set(dir, counts);
                        const parent = path.dirname(dir);
                        if (parent === dir) {
                            break;
                        }
                        dir = parent;
                    }
                }
            }

            for (const [dir, counts] of folderFiles) {
                if (this.decorations.has(dir)) {
                    continue; // directly linked folder, already has a count badge
                }
                const setIds = [...counts.keys()].sort((a, b) => setOrder(a) - setOrder(b));
                const single = setIds.length === 1 ? sets.find(s => s.id === setIds[0]) : undefined;
                const parts = setIds.map(id => `${sets.find(s => s.id === id)?.name ?? id}: ${plural(counts.get(id)!, 'file')}`);
                this.set(dir, new vscode.FileDecoration('•', `Contains linked files (${parts.join(', ')})`, single ? themeColor(single.color) : undefined));
            }
        }

        this.emitter.fire([...previous, ...this.decoratedUris]);
    }

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (!folder) {
            return undefined;
        }
        return this.decorations.get(path.normalize(uri.fsPath));
    }

    dispose(): void {
        this.emitter.dispose();
    }

    private set(absPath: string, decoration: vscode.FileDecoration): void {
        this.decorations.set(absPath, decoration);
        this.decoratedUris.push(toUri(absPath));
    }
}
