/**
 * Types related to visualization functionality
 */

import { VizColor } from './common.types';

/**
 * Represents a single row from a CSV file containing trace links
 */
export interface CsvLinkRow {
    /** Sentence ID (line number in documentation) */
    sentenceID: number;
    /** Code ID (file or directory path) */
    codeID: string;
    /** Optional coverage percentage */
    coverage?: number;
}

/**
 * Aggregation of trace links by sentence ID (line number)
 * Maps sentence IDs to arrays of linked code locations with their visualization colors
 */
export interface LineAggregation {
    [sentenceID: number]: Array<{ codeID: string; color: VizColor; sourceId: string; coverage?: number }>;
}

/**
 * Aggregation of trace links by code file/directory
 * Maps code paths to arrays of linked documentation lines with their visualization colors
 */
export interface FileToLineAggregation {
    [codePath: string]: Array<{ sentenceID: number; color: VizColor; sourceId: string; coverage?: number }>;
}

/**
 * Represents the visualization state for a single history item
 */
export interface VisualizationStateEntry {
    /** Unique identifier of the history entry */
    id: string;
    /** Whether this visualization is currently active */
    active: boolean;
    /** Color assigned to this visualization */
    color: VizColor;
}

/**
 * Persisted visualization state containing all active visualizations
 */
export interface PersistedVisualizationState {
    /** Array of visualization state entries */
    items: VisualizationStateEntry[];
}
