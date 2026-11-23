import * as path from 'path';
import { CsvLinkRow } from '../types';
import { PathResolverService } from './pathResolver.service';
import { FileToLineAggregationService } from './fileToLineAggregation.service';

/**
 * A trace link with its code path normalized for comparison
 */
export interface ComparableLink {
    /** Sentence ID (line number in the documentation) */
    sentenceID: number;
    /** Code path as given in the trace link file */
    codeID: string;
    /** Normalized workspace-relative path: '/'-separated, without leading './' or '/' and without trailing '/' */
    key: string;
    /** Whether the link points to a directory */
    isDir: boolean;
}

/**
 * Comparison of the links of one documentation line in two trace link sets.
 * The reference set is the gold standard if one of the sets is a gold standard, else the first active set.
 */
export interface LineComparison {
    /** Candidate links that the reference set also has (true positives against a gold standard) */
    agreed: ComparableLink[];
    /** Candidate links that the reference set does not have (false positives against a gold standard) */
    candidateOnly: ComparableLink[];
    /** Reference links that the candidate set misses (false negatives against a gold standard) */
    referenceOnly: ComparableLink[];
}

/**
 * Precision, recall and F1 of an approach against a gold standard
 */
export interface EvaluationMetrics {
    /** Approach links that match a gold standard link */
    truePositives: number;
    /** Approach links that match no gold standard link */
    falsePositives: number;
    /** Gold standard links that no approach link matches */
    falseNegatives: number;
    /** Number of gold standard links */
    goldLinks: number;
    /** Number of approach links */
    approachLinks: number;
    precision: number;
    recall: number;
    f1: number;
}

/**
 * Size of a trace link set
 */
export interface SetSummary {
    /** Distinct links (sentence, code path) */
    links: number;
    /** Distinct linked documentation sentences */
    sentences: number;
    /** Distinct linked code files; directory links count every file below the directory */
    files: number;
}

/**
 * Compares trace link sets with each other and evaluates approaches against gold standards.
 *
 * Matching rule (directory heuristic): links are compared per sentence on their normalized code path.
 * Two links of the same sentence match if their paths are equal, or if one of them links a directory
 * that contains the other path. This mirrors the directory heuristic of the visualization, where a
 * directory link stands for all files below it: a gold standard link to `ejb/usermanagement/` and an
 * approach link to `ejb/usermanagement/UserManagementImpl.java` agree with each other.
 * Precision counts approach links that match any gold link (TP / (TP + FP));
 * recall counts gold links that any approach link matches ((gold - FN) / gold).
 */
export class TraceComparisonService {
    /**
     * Normalizes a code path to a workspace-relative, '/'-separated key
     * @param codeID Code path from a trace link file
     * @param workspaceRoot Workspace root, used to relativize absolute paths
     */
    static normalizeCodePath(codeID: string, workspaceRoot?: string): string {
        let p = codeID.trim().replace(/\\/g, '/');
        if (workspaceRoot) {
            const root = workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '');
            if (root && (p === root || p.startsWith(root + '/'))) {
                p = p.substring(root.length);
            }
        }
        const segments: string[] = [];
        for (const segment of p.split('/')) {
            if (segment === '' || segment === '.') {
                continue;
            }
            if (segment === '..') {
                segments.pop();
            } else {
                segments.push(segment);
            }
        }
        return segments.join('/');
    }

    /**
     * Converts trace link rows to comparable links (one per distinct sentence and normalized path)
     * @param rows Trace link rows
     * @param workspaceRoot Workspace root, used to relativize absolute paths
     */
    static toComparableLinks(rows: Array<{ sentenceID: number; codeID: string }>, workspaceRoot?: string): ComparableLink[] {
        const byKey = new Map<string, ComparableLink>();
        const dirCache = new Map<string, boolean>();
        for (const row of rows) {
            const key = this.normalizeCodePath(row.codeID, workspaceRoot);
            if (!key) {
                continue;
            }
            const id = `${row.sentenceID}\u0000${key}`;
            if (byKey.has(id)) {
                continue;
            }
            let isDir = dirCache.get(key);
            if (isDir === undefined) {
                isDir = /[\\/]$/.test(row.codeID.trim()) || PathResolverService.resolvePathType(key).isDir;
                dirCache.set(key, isDir);
            }
            byKey.set(id, { sentenceID: row.sentenceID, codeID: row.codeID, key, isDir });
        }
        return [...byKey.values()];
    }

    /**
     * Whether two links of the same sentence refer to the same code (see the matching rule above)
     */
    static matches(a: ComparableLink, b: ComparableLink): boolean {
        return a.key === b.key
            || (b.isDir && a.key.startsWith(b.key + '/'))
            || (a.isDir && b.key.startsWith(a.key + '/'));
    }

    /**
     * Compares two link sets line by line
     * @param reference Links of the reference set (the gold standard, if any)
     * @param candidate Links of the candidate set (the approach)
     * @returns Comparison per sentence ID, for every sentence linked by at least one of the sets
     */
    static compareLines(reference: ComparableLink[], candidate: ComparableLink[]): Map<number, LineComparison> {
        const refBySentence = this.groupBySentence(reference);
        const candBySentence = this.groupBySentence(candidate);
        const result = new Map<number, LineComparison>();
        const sentences = new Set([...refBySentence.keys(), ...candBySentence.keys()]);
        for (const sentenceID of [...sentences].sort((a, b) => a - b)) {
            const ref = refBySentence.get(sentenceID) ?? [];
            const cand = candBySentence.get(sentenceID) ?? [];
            result.set(sentenceID, {
                agreed: cand.filter(c => ref.some(r => this.matches(c, r))),
                candidateOnly: cand.filter(c => !ref.some(r => this.matches(c, r))),
                referenceOnly: ref.filter(r => !cand.some(c => this.matches(c, r)))
            });
        }
        return result;
    }

    /**
     * Evaluates an approach against a gold standard
     * @param gold Links of the gold standard
     * @param approach Links of the approach
     */
    static evaluate(gold: ComparableLink[], approach: ComparableLink[]): EvaluationMetrics {
        let truePositives = 0;
        let falsePositives = 0;
        let falseNegatives = 0;
        for (const line of this.compareLines(gold, approach).values()) {
            truePositives += line.agreed.length;
            falsePositives += line.candidateOnly.length;
            falseNegatives += line.referenceOnly.length;
        }
        const precision = approach.length > 0 ? truePositives / approach.length : 0;
        const recall = gold.length > 0 ? (gold.length - falseNegatives) / gold.length : 0;
        const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
        return { truePositives, falsePositives, falseNegatives, goldLinks: gold.length, approachLinks: approach.length, precision, recall, f1 };
    }

    /**
     * Summarizes the size of a link set
     * @param rows Trace link rows
     * @param workspaceRoot Workspace root, used to resolve directory links to files
     */
    static summarize(rows: CsvLinkRow[], workspaceRoot?: string): SetSummary {
        const links = this.toComparableLinks(rows, workspaceRoot);
        const sentences = new Set(links.map(l => l.sentenceID));
        const files = new Set<string>();
        const expanded = new Set<string>();
        for (const link of links) {
            if (!link.isDir) {
                files.add(link.key);
            } else if (workspaceRoot && !expanded.has(link.key)) {
                expanded.add(link.key);
                for (const file of FileToLineAggregationService.getAllFilesInDirectory(path.join(workspaceRoot, link.key))) {
                    files.add(this.normalizeCodePath(file, workspaceRoot));
                }
            }
        }
        return { links: links.length, sentences: sentences.size, files: files.size };
    }

    /** Formats a ratio as a two-decimal number (e.g. 0.43) */
    static formatRatio(value: number): string {
        return value.toFixed(2);
    }

    /** One-line summary of evaluation metrics, e.g. "P 0.20 · R 0.44 · F1 0.28" */
    static formatMetrics(m: EvaluationMetrics): string {
        return `P ${this.formatRatio(m.precision)} · R ${this.formatRatio(m.recall)} · F1 ${this.formatRatio(m.f1)}`;
    }

    private static groupBySentence(links: ComparableLink[]): Map<number, ComparableLink[]> {
        const map = new Map<number, ComparableLink[]>();
        for (const link of links) {
            const list = map.get(link.sentenceID) ?? [];
            list.push(link);
            map.set(link.sentenceID, list);
        }
        return map;
    }
}
