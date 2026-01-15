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
    status?: 'loading' | 'completed' | 'error';
    /** Request ID for async operations (e.g., ArDoCo API requests) */
    requestId?: string;
    /** Whether this visualization is currently active */
    active?: boolean;
    /** Color assigned to this visualization */
    color?: VizColor;
    /** Path to the documentation file (for CSV Direct entries) */
    documentationPath?: string;
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
}
