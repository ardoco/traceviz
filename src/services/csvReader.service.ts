import * as fs from 'fs';
import { CsvLinkRow } from '../types';
import {
    CONSTANTS_STRING_CSV_HEADER_SENTENCE_ID_LOWER,
    CONSTANTS_NUMBER_CSV_MIN_COLUMNS
} from '../constants';

/**
 * Service for reading and parsing CSV files containing trace links
 */
export class CsvReaderService {
    /**
     * Reads a CSV file and returns parsed link rows
     * @param filePath Path to the CSV file
     * @returns Array of CSV link rows
     */
    static readCsv(filePath: string): CsvLinkRow[] {
        try {
            if (!fs.existsSync(filePath)) {
                return [];
            }
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
            const rows: CsvLinkRow[] = [];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Skip header row
                if (i === 0 && line.toLowerCase().startsWith(CONSTANTS_STRING_CSV_HEADER_SENTENCE_ID_LOWER)) {
                    continue;
                }
                const parts = this.parseCsvLine(line);
                if (parts.length < CONSTANTS_NUMBER_CSV_MIN_COLUMNS) {
                    continue;
                }
                const sentenceID = parseInt(parts[0], 10);
                const codeID = parts[1];
                if (Number.isFinite(sentenceID) && codeID) {
                    rows.push({ sentenceID, codeID });
                }
            }
            return rows;
        } catch {
            return [];
        }
    }

    /**
     * Parses a single CSV line, handling quoted values
     * @param line CSV line to parse
     * @returns Array of parsed values
     */
    static parseCsvLine(line: string): string[] {
        const result: string[] = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (ch === ',' && !inQuotes) {
                result.push(cur);
                cur = '';
            } else {
                cur += ch;
            }
        }
        result.push(cur);
        return result;
    }
}

