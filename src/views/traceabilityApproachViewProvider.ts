import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CONSTANTS_FILE_PATH_ARDOCO_CONFIG, CONSTANTS_FILE_PATH_ARDOCO_CODE_MODEL, CONSTANTS_FILE_PATH_ARDOCO_TRACE_LINKS } from '../constants';
import { TraceVizStorageUtil } from '../utils/traceVizStorage.util';

/**
 * Tree data provider for the Traceability Approach view
 * Displays available traceability approaches and their configuration status
 */
export class TraceabilityApproachViewProvider implements vscode.TreeDataProvider<ApproachItem>, vscode.Disposable {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ApproachItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ApproachItem | undefined | null | void> = this.onDidChangeTreeDataEmitter.event;
    private readonly disposables: vscode.Disposable[] = [];

    constructor() {
        // Listen for workspace changes to refresh the view
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this.refresh();
            })
        );

        // Listen for file system changes in the .trace-viz folder
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument((document) => {
                if (document.uri.fsPath.includes('.trace-viz')) {
                    this.refresh();
                }
            })
        );

        // Listen for file creation/deletion in the .trace-viz folder
        const watcher = vscode.workspace.createFileSystemWatcher('**/.trace-viz/**');
        watcher.onDidCreate(() => this.refresh());
        watcher.onDidDelete(() => this.refresh());
        watcher.onDidChange(() => this.refresh());
        this.disposables.push(watcher);
    }

    getTreeItem(element: ApproachItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ApproachItem): Thenable<ApproachItem[]> {
        if (!element) {
            return Promise.resolve([
                new ApproachItem('CSV Direct', vscode.TreeItemCollapsibleState.None),
                new ApproachItem('ArDoCo', vscode.TreeItemCollapsibleState.Collapsed, 'traceViz.ardoCoItem'),
                new ApproachItem('LiSSA', vscode.TreeItemCollapsibleState.None)
            ]);
        }
        if (element.label === 'ArDoCo') {
            const hasConfig = checkArDoCoConfigExists();
            const hasCodeModel = checkArDoCoCodeModelExists();
            const hasTraceLinks = checkArDoCoTraceLinksExist();
            const traceLinksPrerequisitesMet = hasConfig && hasCodeModel;
            return Promise.resolve([
                new ApproachItem('ArDoCo Config', vscode.TreeItemCollapsibleState.None, 'traceViz.ardoCoConfig', hasConfig),
                new ApproachItem('Generate Code Model', vscode.TreeItemCollapsibleState.None, 'traceViz.ardoCoGenerateModel', hasCodeModel, hasConfig, hasConfig && !hasCodeModel),
                new ApproachItem('Generate Trace Links', vscode.TreeItemCollapsibleState.Collapsed, 'traceViz.ardoCoGenerateLinks', undefined, undefined, traceLinksPrerequisitesMet)
            ]);
        }
        if (element.label === 'Generate Trace Links') {
            const samCodePrerequisitesMet = checkSamCodePrerequisites();
            const sadSamPrerequisitesMet = checkSadSamPrerequisites();
            const sadSamCodePrerequisitesMet = checkSadSamCodePrerequisites();
            const sadCodePrerequisitesMet = checkSadCodePrerequisites();
            
            return Promise.resolve([
                new ApproachItem('SAM-Code', vscode.TreeItemCollapsibleState.None, 'traceViz.samCode', undefined, samCodePrerequisitesMet, samCodePrerequisitesMet),
                new ApproachItem('SAD-SAM', vscode.TreeItemCollapsibleState.None, 'traceViz.sadSam', undefined, sadSamPrerequisitesMet, sadSamPrerequisitesMet),
                new ApproachItem('SAD-SAM-Code', vscode.TreeItemCollapsibleState.None, 'traceViz.sadSamCode', undefined, sadSamCodePrerequisitesMet, sadSamCodePrerequisitesMet),
                new ApproachItem('SAD-Code', vscode.TreeItemCollapsibleState.None, 'traceViz.sadCode', undefined, sadCodePrerequisitesMet, sadCodePrerequisitesMet)
            ]);
        }
        return Promise.resolve([]);
    }

    refresh(): void {
        this.onDidChangeTreeDataEmitter.fire();
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.onDidChangeTreeDataEmitter.dispose();
    }
}

/**
 * Tree item representing a traceability approach or configuration step
 */
export class ApproachItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue?: string,
        public readonly isComplete?: boolean,
        public readonly isEnabled?: boolean,
        public readonly prerequisitesMet?: boolean
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue || 'traceViz.approachItem';
        
        // Add status icon
        if (isComplete === true) {
            // Task completed - green check
            this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
        } else if (prerequisitesMet !== undefined) {
            // Prerequisites status - green circle if met, red X if not met
            this.iconPath = prerequisitesMet ? new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green')) : new vscode.ThemeIcon('x', new vscode.ThemeColor('charts.red'));
        } else if (isComplete === false) {
            // Task not completed and no prerequisites info - red X
            this.iconPath = new vscode.ThemeIcon('x', new vscode.ThemeColor('charts.red'));
        }
        
        // Add commands for different items
        if (label === 'CSV Direct') {
            this.command = {
                command: 'trace-viz.csvDirect',
                title: 'Select CSV File'
            };
        } else if (label === 'LiSSA') {
            this.command = {
                command: 'trace-viz.openLissaWebview',
                title: 'Open LiSSA Configuration'
            };
        } else if (label === 'ArDoCo Config') {
            this.command = {
                command: 'trace-viz.openArDoCoWebview',
                title: 'Open ArDoCo Configuration'
            };
        } else if (label === 'Generate Code Model' && isEnabled) {
            this.command = {
                command: 'trace-viz.ardoCoGenerateModel',
                title: 'Generate Code Model'
            };
        } else if (label === 'SAD-Code' && isEnabled) {
            this.command = {
                command: 'trace-viz.sadCode',
                title: 'Generate SAD-Code Trace Links'
            };
        } else if (label === 'SAM-Code' && isEnabled) {
            this.command = {
                command: 'trace-viz.samCode',
                title: 'Generate SAM-Code Trace Links'
            };
        } else if (label === 'SAD-SAM' && isEnabled) {
            this.command = {
                command: 'trace-viz.sadSam',
                title: 'Generate SAD-SAM Trace Links'
            };
        } else if (label === 'SAD-SAM-Code' && isEnabled) {
            this.command = {
                command: 'trace-viz.sadSamCode',
                title: 'Generate SAD-SAM-Code Trace Links'
            };
        }
    }
}

function checkArDoCoConfigExists(): boolean {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        return false;
    }
    return TraceVizStorageUtil.fileExists(CONSTANTS_FILE_PATH_ARDOCO_CONFIG, workspaceFolder);
}

function checkArDoCoCodeModelExists(): boolean {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        return false;
    }
    return TraceVizStorageUtil.fileExists(CONSTANTS_FILE_PATH_ARDOCO_CODE_MODEL, workspaceFolder);
}

function checkArDoCoTraceLinksExist(): boolean {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        return false;
    }
    return TraceVizStorageUtil.fileExists(CONSTANTS_FILE_PATH_ARDOCO_TRACE_LINKS, workspaceFolder);
}

function checkSamCodePrerequisites(): boolean {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        return false;
    }

    const config = TraceVizStorageUtil.readJsonFile<any>(CONSTANTS_FILE_PATH_ARDOCO_CONFIG, workspaceFolder);
    if (!config) {
        return false;
    }
    
    // SAM-Code requires: Architecture Model Path and Code Path
    return !!(config.architectureModelPath && config.codePath && 
             fs.existsSync(config.architectureModelPath) && 
             fs.existsSync(config.codePath));
}

function checkSadSamPrerequisites(): boolean {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        return false;
    }

    const config = TraceVizStorageUtil.readJsonFile<any>(CONSTANTS_FILE_PATH_ARDOCO_CONFIG, workspaceFolder);
    if (!config) {
        return false;
    }
    
    // SAD-SAM requires: Documentation Path and Architecture Model Path
    return !!(config.documentationPath && config.architectureModelPath && 
             fs.existsSync(config.documentationPath) && 
             fs.existsSync(config.architectureModelPath));
}

function checkSadSamCodePrerequisites(): boolean {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        return false;
    }

    const config = TraceVizStorageUtil.readJsonFile<any>(CONSTANTS_FILE_PATH_ARDOCO_CONFIG, workspaceFolder);
    if (!config) {
        return false;
    }
    
    // SAD-SAM-Code requires: Documentation Path and Architecture Model Path and Code Path
    return !!(config.documentationPath && config.architectureModelPath && config.codePath && 
             fs.existsSync(config.documentationPath) && 
             fs.existsSync(config.architectureModelPath) && 
             fs.existsSync(config.codePath));
}

function checkSadCodePrerequisites(): boolean {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        return false;
    }

    const config = TraceVizStorageUtil.readJsonFile<any>(CONSTANTS_FILE_PATH_ARDOCO_CONFIG, workspaceFolder);
    if (!config) {
        return false;
    }
    
    // SAD-Code requires: Documentation Path and Code Path
    return !!(config.documentationPath && config.codePath && 
             fs.existsSync(config.documentationPath) && 
             fs.existsSync(config.codePath));
}


