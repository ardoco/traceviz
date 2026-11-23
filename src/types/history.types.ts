/**
 * Types related to trace history management
 */

import { VizColor } from './common.types';

/**
 * Represents a trace link generation history entry
 */
export interface TraceHistoryEntry {
    /** Unique identifier for this history entry */
    id: string;
    /** Timestamp when the trace links were generated */
    timestamp: string;
    /** Name of the traceability approach used (e.g., 'SAD-Code', 'CSV Direct') */
    approach: string;
    /** Path to the CSV file containing trace links */
    csvPath: string;
    /** Original name of the file or description */
    originalName: string;
    /** Current status of the trace link generation */
    status?: 'loading' | 'completed' | 'error' | 'cancelled';
    /** Request ID for async operations (e.g., ArDoCo API requests) */
    requestId?: string;
    /** Whether this visualization is currently active */
    active?: boolean;
    /** Color assigned to this visualization */
    color?: VizColor;
    /** Path to the documentation file (for CSV Direct entries) */
    documentationPath?: string;
    /** Human-readable name of this trace link set (optional; falls back to approach and original name) */
    label?: string;
    /**
     * Whether this set is a gold standard that other sets are evaluated against.
     * If omitted, a set counts as gold standard when its label, original name or approach contains "gold".
     */
    isGoldStandard?: boolean;
}

/**
 * Represents an active history item used for visualization
 */
export interface ActiveHistoryItem {
    /** Unique identifier for this history entry */
    id: string;
    /** Path to the CSV file containing trace links */
    csvPath: string;
    /** Color assigned to this visualization */
    color: VizColor;
    /** Human-readable name of this trace link set */
    name: string;
    /** Whether this set is a gold standard (explicit flag or "gold" in its name) */
    isGoldStandard: boolean;
}
