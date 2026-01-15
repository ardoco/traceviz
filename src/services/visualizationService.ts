import * as vscode from 'vscode';
import { VizColor, VisualizationStateEntry, PersistedVisualizationState } from '../types';
import {
    CONSTANTS_FILE_PATH_VISUALIZATION_STATE,
    CONSTANTS_NUMBER_MAX_ACTIVE_VISUALIZATIONS,
    CONSTANTS_NUMBER_JSON_INDENT
} from '../constants';
import { TraceVizStorageUtil } from '../utils/traceVizStorage.util';

/**
 * Service for managing visualization state (active/inactive, colors)
 * Implements singleton pattern to ensure consistent state across the extension
 */
export class VisualizationService implements vscode.Disposable {
    private static instance: VisualizationService | undefined;
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
    /** Event fired when visualization state changes */
    readonly onDidChange = this.onDidChangeEmitter.event;

    private stateById = new Map<string, VisualizationStateEntry>();
    private readonly maxActive = CONSTANTS_NUMBER_MAX_ACTIVE_VISUALIZATIONS;

    /**
     * Gets the singleton instance of VisualizationService
     * @returns The VisualizationService instance
     */
    static getInstance(): VisualizationService {
        if (!VisualizationService.instance) {
            VisualizationService.instance = new VisualizationService();
        }
        return VisualizationService.instance;
    }

    private constructor() {
        this.loadState();
    }

    /**
     * Gets the visualization state for a given ID, creating a default state if it doesn't exist
     * @param id Unique identifier for the visualization
     * @returns Visualization state entry
     */
    getState(id: string): VisualizationStateEntry {
        const existing = this.stateById.get(id);
        if (existing) {return existing;}
        const created: VisualizationStateEntry = { id, active: false, color: 'blue' };
        this.stateById.set(id, created);
        return created;
    }

    /**
     * Gets the count of currently active visualizations
     * @returns Number of active visualizations
     */
    getActiveCount(): number {
        let count = 0;
        for (const v of this.stateById.values()) {if (v.active) {count++;}}
        return count;
    }

    /**
     * Toggles the active state of a visualization
     * @param id Unique identifier for the visualization
     */
    toggle(id: string): void {
        const state = this.getState(id);
        if (state.active) {
            state.active = false;
        } else {
            if (this.getActiveCount() >= this.maxActive) {
                vscode.window.showWarningMessage(`Only ${this.maxActive} visualizations can be active at once.`);
                return;
            }
            state.active = true;
        }
        this.saveState();
        this.onDidChangeEmitter.fire();
    }

    /**
     * Cycles the color of a visualization through the available colors
     * @param id Unique identifier for the visualization
     */
    cycleColor(id: string): void {
        const order: VizColor[] = ['blue', 'red', 'orange', 'green'];
        const state = this.getState(id);
        const idx = order.indexOf(state.color);
        state.color = order[(idx + 1) % order.length];
        this.saveState();
        this.onDidChangeEmitter.fire();
    }

    private loadState(): void {
        try {
            const data = TraceVizStorageUtil.readJsonFile<PersistedVisualizationState>(
                CONSTANTS_FILE_PATH_VISUALIZATION_STATE
            );
            if (!data) {return;}
            this.stateById.clear();
            for (const item of data.items) {
                this.stateById.set(item.id, item);
            }
        } catch {
            // ignore
        }
    }

    private saveState(): void {
        try {
            const data: PersistedVisualizationState = { items: Array.from(this.stateById.values()) };
            TraceVizStorageUtil.writeJsonFile(
                CONSTANTS_FILE_PATH_VISUALIZATION_STATE,
                data,
                CONSTANTS_NUMBER_JSON_INDENT
            );
        } catch {
            // ignore
        }
    }

    dispose(): void {
        this.onDidChangeEmitter.dispose();
    }
}


