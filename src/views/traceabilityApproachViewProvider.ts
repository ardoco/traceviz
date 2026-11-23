import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CONSTANTS_FILE_PATH_ARDOCO_CONFIG, CONSTANTS_FILE_PATH_ARDOCO_TRACE_LINKS } from '../constants';
import { ArDoCoConfig } from '../types';
import { TraceVizStorageUtil } from '../utils/traceVizStorage.util';
import { getCodeModelPath, readArDoCoConfig } from '../traceabilityApproach/ardoco/configArDoCo';

/**
 * Tree data provider for the Traceability Approach view
 * Displays available traceability approaches and their configuration status
 */
export class TraceabilityApproachViewProvider implements vscode.TreeDataProvider<ApproachItem>, vscode.Disposable {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ApproachItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ApproachItem | undefined | null | void> = this.onDidChangeTreeDataEmitter.event;
    private readonly disposables: vscode.Disposable[] = [];

    /**
     * @param nodeFeatures Whether features that need Node.js (LiSSA, ARDoCo code model extraction) are available;
     *                     false in VS Code for the Web, where they are shown as unavailable
     */
    constructor(private readonly nodeFeatures: boolean = true) {
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
                new ApproachItem('ARDoCo', vscode.TreeItemCollapsibleState.Collapsed, 'traceViz.ardoCoItem'),
                this.nodeFeatures ? new ApproachItem('LiSSA', vscode.TreeItemCollapsibleState.None) : ApproachItem.desktopOnly('LiSSA')
            ]);
        }
        if (element.label === 'ARDoCo') {
            const hasConfig = checkArDoCoConfigExists();
            const hasCodeModel = checkArDoCoCodeModelExists();
            const hasTraceLinks = checkArDoCoTraceLinksExist();
            const traceLinksPrerequisitesMet = hasConfig && hasCodeModel;
            const selectCodeModel = new ApproachItem('Select Code Model', vscode.TreeItemCollapsibleState.None, 'traceViz.ardoCoSelectCodeModel', hasCodeModel, true, hasCodeModel);
            selectCodeModel.description = getCodeModelFileName();
            selectCodeModel.tooltip = 'Select an existing JSON code model (.acm/.json) that is sent to the ARDoCo REST API';
            return Promise.resolve([
                new ApproachItem('ARDoCo Config', vscode.TreeItemCollapsibleState.None, 'traceViz.ardoCoConfig', hasConfig),
                selectCodeModel,
                this.nodeFeatures
                    ? new ApproachItem('Generate Code Model', vscode.TreeItemCollapsibleState.None, 'traceViz.ardoCoGenerateModel', hasCodeModel, hasConfig, hasConfig && !hasCodeModel)
                    : ApproachItem.desktopOnly('Generate Code Model'),
                new ApproachItem('Generate Trace Links', vscode.TreeItemCollapsibleState.Collapsed, 'traceViz.ardoCoGenerateLinks', undefined, undefined, traceLinksPrerequisitesMet)
            ]);
        }
        if (element.label === 'Generate Trace Links') {
            const samCodePrerequisitesMet = checkSamCodePrerequisites();
            const sadSamPrerequisitesMet = checkSadSamPrerequisites();
            const sadSamCodePrerequisitesMet = checkSadSamCodePrerequisites();
            const sadCodePrerequisitesMet = checkSadCodePrerequisites();
            
            return Promise.resolve([
                new ApproachItem('ArCoTL (SAM-Code)', vscode.TreeItemCollapsibleState.None, 'traceViz.samCode', undefined, false, false, true),
                new ApproachItem('SWATTR (SAD-SAM)', vscode.TreeItemCollapsibleState.None, 'traceViz.sadSam', undefined, false, false, true),
                new ApproachItem('TransArC (SAD-SAM-Code)', vscode.TreeItemCollapsibleState.None, 'traceViz.sadSamCode', undefined, sadSamCodePrerequisitesMet, sadSamCodePrerequisitesMet),
                new ApproachItem('ArDoCode (SAD-Code)', vscode.TreeItemCollapsibleState.None, 'traceViz.sadCode', undefined, sadCodePrerequisitesMet, sadCodePrerequisitesMet)
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
    /**
     * Creates an item for an approach that needs the desktop (Node.js) version of the extension
     * @param label Name of the approach
     * @returns A disabled tree item explaining why the approach is unavailable
     */
    static desktopOnly(label: string): ApproachItem {
        const item = new ApproachItem(label, vscode.TreeItemCollapsibleState.None, undefined, undefined, false, false, true);
        item.description = 'desktop only';
        item.tooltip = `${label} needs local tools or network access that are not available in VS Code for the Web.`;
        return item;
    }

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue?: string,
        public readonly isComplete?: boolean,
        public readonly isEnabled?: boolean,
        public readonly prerequisitesMet?: boolean,
        public readonly notSupported?: boolean
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue || 'traceViz.approachItem';

        if (notSupported) {
            this.iconPath = new vscode.ThemeIcon('dash');
            this.tooltip = 'Not supported yet';
            return;
        }

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
        } else if (label === 'ARDoCo Config') {
            this.command = {
                command: 'trace-viz.openArDoCoWebview',
                title: 'Open ARDoCo Configuration'
            };
        } else if (label === 'Select Code Model') {
            this.command = {
                command: 'trace-viz.ardoCoSelectCodeModel',
                title: 'Select Code Model'
            };
        } else if (label === 'Generate Code Model' && isEnabled) {
            this.command = {
                command: 'trace-viz.ardoCoGenerateModel',
                title: 'Generate Code Model'
            };
        } else if (label === 'ArDoCode (SAD-Code)' && isEnabled) {
            this.command = {
                command: 'trace-viz.sadCode',
                title: 'Generate ArDoCode (SAD-Code) Trace Links'
            };
        } else if (label === 'ArCoTL (SAM-Code)' && isEnabled) {
            this.command = {
                command: 'trace-viz.samCode',
                title: 'Generate ArCoTL (SAM-Code) Trace Links'
            };
        } else if (label === 'SWATTR (SAD-SAM)' && isEnabled) {
            this.command = {
                command: 'trace-viz.sadSam',
                title: 'Generate SWATTR (SAD-SAM) Trace Links'
            };
        } else if (label === 'TransArC (SAD-SAM-Code)' && isEnabled) {
            this.command = {
                command: 'trace-viz.sadSamCode',
                title: 'Generate TransArC (SAD-SAM-Code) Trace Links'
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

/**
 * Reads the ARDoCo configuration and the code model path of the first workspace folder
 */
function readConfigWithCodeModel(): { config: ArDoCoConfig; codeModelPath?: string } | undefined {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        return undefined;
    }
    const config = readArDoCoConfig(workspaceFolder);
    if (!config) {
        return undefined;
    }
    return { config, codeModelPath: getCodeModelPath(config, workspaceFolder) };
}

function fileExists(filePath?: string): boolean {
    return !!filePath && fs.existsSync(filePath);
}

function checkArDoCoCodeModelExists(): boolean {
    return fileExists(readConfigWithCodeModel()?.codeModelPath);
}

function getCodeModelFileName(): string | undefined {
    const codeModelPath = readConfigWithCodeModel()?.codeModelPath;
    return fileExists(codeModelPath) ? path.basename(codeModelPath!) : undefined;
}

function checkArDoCoTraceLinksExist(): boolean {
    const workspaceFolder = TraceVizStorageUtil.getWorkspaceFolder();
    if (!workspaceFolder) {
        return false;
    }
    return TraceVizStorageUtil.fileExists(CONSTANTS_FILE_PATH_ARDOCO_TRACE_LINKS, workspaceFolder);
}

function checkSamCodePrerequisites(): boolean {
    const current = readConfigWithCodeModel();
    // SAM-Code requires: Architecture Model and Code Model
    return !!current && fileExists(current.config.architectureModelPath) && fileExists(current.codeModelPath);
}

function checkSadSamPrerequisites(): boolean {
    const current = readConfigWithCodeModel();
    // SAD-SAM requires: Documentation and Architecture Model
    return !!current && fileExists(current.config.documentationPath) && fileExists(current.config.architectureModelPath);
}

function checkSadSamCodePrerequisites(): boolean {
    const current = readConfigWithCodeModel();
    // SAD-SAM-Code requires: Documentation, Architecture Model and Code Model
    return !!current && fileExists(current.config.documentationPath) && fileExists(current.config.architectureModelPath) && fileExists(current.codeModelPath);
}

function checkSadCodePrerequisites(): boolean {
    const current = readConfigWithCodeModel();
    // SAD-Code requires: Documentation and Code Model
    return !!current && fileExists(current.config.documentationPath) && fileExists(current.codeModelPath);
}
