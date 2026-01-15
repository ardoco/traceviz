import * as fs from 'fs';
import { SadCodeResponse } from '../../types';

/**
 * Types of trace link conversions supported
 */
export type TraceLinkConversionType = 'ARDOCO_SAD_CODE_TO_CSV' | 'CSV_COMPRESS_BY_DIRECTORY';

/**
 * Job specification for trace link conversion
 */
export interface ConversionJob {
    /** Type of conversion to perform */
    type: TraceLinkConversionType;
    /** Input data for the conversion (format depends on type) */
    input: unknown;
}

/**
 * Converts trace link data to CSV format based on the job type
 * @param job Conversion job specification
 * @returns CSV string with trace links
 * @throws Error if conversion type is unsupported
 */
export function convert(job: ConversionJob): string {
    switch (job.type) {
        case 'ARDOCO_SAD_CODE_TO_CSV':
            return convertArDoCoSadCodeToCsv(job.input as SadCodeResponse);
        case 'CSV_COMPRESS_BY_DIRECTORY':
            return compressCsvByDirectory(job.input as string);
        default:
            throw new Error(`Unsupported conversion type: ${job.type}`);
    }
}

/**
 * Converts ArDoCo SAD-Code API response to CSV format
 * @param result ArDoCo API response object with traceLinks array
 * @returns CSV string with sentenceID and codeID columns
 */
export function convertArDoCoSadCodeToCsv(result: SadCodeResponse | { traceLinks?: any[] }): string {
    const lines: string[] = ['sentenceID,codeID'];
    const traceLinks = result.traceLinks || (result as any).result?.traceLinks;
    
    if (traceLinks && Array.isArray(traceLinks)) {
        for (const link of traceLinks) {
            // Handle new API format with codeElementId
            const codeId = link.codeElementId || link.codeCompilationUnit;
            const sentenceNumber = link.sentenceNumber;
            
            if (sentenceNumber !== undefined && codeId) {
                // Convert sentenceNumber to string (it may be string or number from API)
                const sentence = String(sentenceNumber);
                const code = csvEscape(codeId);
                lines.push(`${sentence},${code}`);
            }
        }
    }
    return lines.join('\n');
}

function csvEscape(value: string): string {
    if (value.includes('"') || value.includes(',') || value.includes('\n')) {
        return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
}

/**
 * Writes text content to a file
 * @param filePath Path to the file to write
 * @param content Text content to write
 */
export function writeTextFile(filePath: string, content: string): void {
    fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Minimum percentage (0-100) of files in a directory that must be linked for that directory
 * to be used as a compressed entry; otherwise individual files are kept.
 */
export const COMPRESS_MIN_PERCENT = 50;

/**
 * Compresses CSV trace links by grouping codeIDs into parent directories when coverage >= threshold.
 * 
 * Output CSV format: sentenceID,codeID
 * - sentenceID: original sentence id
 * - codeID: either the grouped directory path (without trailing slash) or the original file path
 * 
 * @param csvContent Input CSV content with sentenceID and codeID columns
 * @returns Compressed CSV string
 */
export function compressCsvByDirectory(csvContent: string): string {
    const lines = csvContent.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {return 'sentenceID,codeID';}
    const header = lines[0].trim();
    const hasHeader = header.toLowerCase().startsWith('sentenceid');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    // sentence -> dir -> Set(files)
    const sentenceToDirToFiles: Map<string, Map<string, Set<string>>> = new Map();
    // Also track all files by dir across entire CSV (for coverage denominator)
    const dirToAllFiles: Map<string, Set<string>> = new Map();
    for (const line of dataLines) {
        const [sentenceIDRaw, codeIDRaw] = safeSplitCsv(line);
        if (!sentenceIDRaw || !codeIDRaw) {continue;}
        const sentenceID = sentenceIDRaw.trim();
        const codeID = codeIDRaw.trim();
        // Derive directory and filename
        const { parentDir, fileName } = splitPath(codeID);
        if (!parentDir || !fileName) {continue;}
        if (!sentenceToDirToFiles.has(sentenceID)) {
            sentenceToDirToFiles.set(sentenceID, new Map());
        }
        const dirMap = sentenceToDirToFiles.get(sentenceID)!;
        if (!dirMap.has(parentDir)) {
            dirMap.set(parentDir, new Set());
        }
        dirMap.get(parentDir)!.add(fileName);

        if (!dirToAllFiles.has(parentDir)) {dirToAllFiles.set(parentDir, new Set());}
        dirToAllFiles.get(parentDir)!.add(fileName);
    }

    // Build output: for each sentence, include directory rows where coverage >= threshold, and keep individual file rows otherwise
    const out: string[] = ['sentenceID,codeID'];
    for (const [sentence, dirMap] of sentenceToDirToFiles) {
        // Determine which dirs meet threshold
        const groupedDirs = new Set<string>();
        for (const [dir, files] of dirMap) {
            const allFiles = dirToAllFiles.get(dir) || new Set<string>();
            const totalFilesInDir = allFiles.size;
            const covered = files.size;
            const coverage = totalFilesInDir > 0 ? Math.round((covered / totalFilesInDir) * 100) : 100;
            if (coverage >= COMPRESS_MIN_PERCENT) {
                groupedDirs.add(dir);
            }
        }

        // Emit grouped directory rows
        for (const dir of groupedDirs) {
            out.push(`${sentence},${csvEscape(dir)}`);
        }

        // Emit ungrouped individual file rows for dirs below threshold
        for (const [dir, files] of dirMap) {
            if (groupedDirs.has(dir)) {continue;}
            for (const f of files) {
                out.push(`${sentence},${csvEscape(joinPath(dir, f))}`);
            }
        }
    }
    return out.join('\n');
}

function splitPath(p: string): { parentDir: string | null, fileName: string | null } {
    if (!p) {return { parentDir: null, fileName: null };}
    const norm = p.replace(/\\/g, '/');
    const idx = norm.lastIndexOf('/');
    if (idx === -1) {return { parentDir: '', fileName: norm };}
    const parent = norm.substring(0, idx);
    const file = norm.substring(idx + 1);
    return { parentDir: parent, fileName: file };
}

function joinPath(dir: string, file: string): string {
    if (!dir) {return file;}
    if (dir.endsWith('/')) {return dir + file;}
    return dir + '/' + file;
}

function safeSplitCsv(line: string): [string, string] {
    // simple CSV split for two columns; handle quotes
    const m = line.match(/^\s*([^,\"]+|\"(?:[^\"]|\"\")*\")\s*,\s*(.+)\s*$/);
    if (!m) {return ['', ''];}
    const a = unquote(m[1]);
    const b = unquote(m[2]);
    return [a, b];
}

function unquote(v: string): string {
    const t = v.trim();
    if (t.startsWith('"') && t.endsWith('"')) {
        return t.slice(1, -1).replace(/""/g, '"');
    }
    return t;
}

