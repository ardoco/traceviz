import * as path from 'path';
import * as fs from 'fs';
import { ActiveHistoryItem, FileToLineAggregation } from '../types';
import { CsvReaderService } from './csvReader.service';
import { PathResolverService } from './pathResolver.service';

/**
 * Service for aggregating trace links from code files to documentation lines
 * Includes directory heuristic: if a directory has links, all files in that directory inherit them
 */
export class FileToLineAggregationService {
    /**
     * Aggregates links from active history items by code file/directory
     * Includes directory heuristic: files inherit links from their parent directories
     * @param items Active history items with CSV files
     * @param workspaceRoot Root path of the workspace for resolving relative paths
     * @returns File-to-line aggregation map
     */
    static aggregateFileToLines(items: ActiveHistoryItem[], workspaceRoot: string): FileToLineAggregation {
        const agg: FileToLineAggregation = {};

        // First pass: collect direct file/directory links
        for (const item of items) {
            const rows = CsvReaderService.readCsv(item.csvPath);
            for (const row of rows) {
                const codePath = this.normalizePath(row.codeID, workspaceRoot);
                if (!codePath) {
                    continue;
                }

                if (!agg[codePath]) {
                    agg[codePath] = [];
                }
                agg[codePath].push({
                    sentenceID: row.sentenceID,
                    color: item.color,
                    sourceId: item.id
                });
            }
        }

        // Second pass: apply directory heuristic
        // For each file in the workspace, check if any parent directory has links
        this.applyDirectoryHeuristic(agg, workspaceRoot);

        return agg;
    }

    /**
     * Normalizes a code path to an absolute path
     */
    private static normalizePath(codePath: string, workspaceRoot: string): string | undefined {
        if (!codePath) {
            return undefined;
        }

        // If already absolute, return as-is
        if (path.isAbsolute(codePath)) {
            return path.normalize(codePath);
        }

        // If relative, resolve against workspace root
        return path.normalize(path.resolve(workspaceRoot, codePath));
    }

    /**
     * Applies directory heuristic: files inherit links from their parent directories
     */
    private static applyDirectoryHeuristic(agg: FileToLineAggregation, workspaceRoot: string): void {
        // Get all directories that have links
        const directoriesWithLinks = new Set<string>();
        for (const codePath of Object.keys(agg)) {
            // Check if path exists and is a directory
            if (fs.existsSync(codePath)) {
                try {
                    const stat = fs.statSync(codePath);
                    if (stat.isDirectory()) {
                        directoriesWithLinks.add(path.normalize(codePath));
                    }
                } catch {
                    // Ignore errors, try heuristic
                }
            }
            
            // Fallback to heuristic if path doesn't exist
            if (!directoriesWithLinks.has(path.normalize(codePath))) {
                const pathInfo = PathResolverService.resolvePathType(codePath);
                if (pathInfo.isDir) {
                    directoriesWithLinks.add(path.normalize(codePath));
                }
            }
        }

        // For each directory with links, find all files in that directory
        for (const dirPath of directoriesWithLinks) {
            if (!fs.existsSync(dirPath)) {
                continue;
            }

            const links = agg[dirPath];
            if (!links || links.length === 0) {
                continue;
            }

            // Recursively find all files in this directory
            const filesInDir = this.getAllFilesInDirectory(dirPath);
            
            for (const filePath of filesInDir) {
                const normalizedFile = path.normalize(filePath);
                
                // Don't overwrite existing direct links, but merge directory links
                if (!agg[normalizedFile]) {
                    agg[normalizedFile] = [];
                }
                
                // Add directory links that aren't already present
                for (const link of links) {
                    const exists = agg[normalizedFile].some(
                        existing => existing.sentenceID === link.sentenceID && 
                                   existing.color === link.color &&
                                   existing.sourceId === link.sourceId
                    );
                    if (!exists) {
                        agg[normalizedFile].push({ ...link });
                    }
                }
            }
        }
    }

    /**
     * Recursively gets all files in a directory
     */
    private static getAllFilesInDirectory(dirPath: string): string[] {
        const files: string[] = [];
        
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isFile()) {
                    files.push(fullPath);
                } else if (entry.isDirectory()) {
                    // Recursively get files from subdirectories
                    files.push(...this.getAllFilesInDirectory(fullPath));
                }
            }
        } catch {
            // Ignore errors (permissions, etc.)
        }
        
        return files;
    }

    /**
     * Gets trace links for a specific file, including directory inheritance
     * Checks the file itself and all parent directories
     * @param filePath Absolute path to the file
     * @param aggregation File-to-line aggregation map
     * @returns Array of linked documentation lines
     */
    static getLinksForFile(filePath: string, aggregation: FileToLineAggregation): Array<{ sentenceID: number; color: string; sourceId: string }> {
        const normalizedPath = path.normalize(filePath);
        const links: Array<{ sentenceID: number; color: string; sourceId: string }> = [];
        const seen = new Set<string>();
        
        // First, get direct links for the file
        const directLinks = aggregation[normalizedPath] || [];
        for (const link of directLinks) {
            const key = `${link.sentenceID}-${link.color}-${link.sourceId}`;
            if (!seen.has(key)) {
                seen.add(key);
                links.push(link);
            }
        }
        
        // Then, check all parent directories
        let currentDir = path.dirname(normalizedPath);
        const rootDir = path.parse(normalizedPath).root;
        
        while (currentDir !== rootDir && currentDir !== normalizedPath) {
            const dirLinks = aggregation[currentDir] || [];
            for (const link of dirLinks) {
                const key = `${link.sentenceID}-${link.color}-${link.sourceId}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    links.push(link);
                }
            }
            
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                break; // Reached root
            }
            currentDir = parentDir;
        }
        
        return links;
    }
}

