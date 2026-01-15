/**
 * Centralized constants for the trace-viz extension
 */

// ============================================================================
// FILE PATHS
// ============================================================================

/** Directory name for trace-viz workspace storage */
export const CONSTANTS_FILE_PATH_STORAGE_DIR = '.trace-viz';

/** ArDoCo configuration file name */
export const CONSTANTS_FILE_PATH_ARDOCO_CONFIG = 'ardoco-config.json';

/** ArDoCo code model file name */
export const CONSTANTS_FILE_PATH_ARDOCO_CODE_MODEL = 'ardoco-code-model.json';

/** ArDoCo trace links file name */
export const CONSTANTS_FILE_PATH_ARDOCO_TRACE_LINKS = 'ardoco-trace-links.json';

/** Trace history file name */
export const CONSTANTS_FILE_PATH_HISTORY = 'history.json';

/** Visualization state file name */
export const CONSTANTS_FILE_PATH_VISUALIZATION_STATE = 'visualization-state.json';

// ============================================================================
// COMMAND IDS
// ============================================================================

/** Command prefix for all trace-viz commands */
export const CONSTANTS_COMMAND_PREFIX = 'trace-viz';

/** Command: Open settings */
export const CONSTANTS_COMMAND_OPEN_SETTINGS = 'trace-viz.openSettings';

/** Command: Browse for Code Model Extractor JAR */
export const CONSTANTS_COMMAND_BROWSE_JAR = 'trace-viz.browseCodeModelExtractorJar';

/** Command: CSV Direct file picker */
export const CONSTANTS_COMMAND_CSV_DIRECT = 'trace-viz.csvDirect';

/** Command: Refresh trace history */
export const CONSTANTS_COMMAND_REFRESH_HISTORY = 'trace-viz.refreshHistory';

/** Command: Open ArDoCo webview */
export const CONSTANTS_COMMAND_OPEN_ARDOCO_WEBVIEW = 'trace-viz.openArDoCoWebview';

/** Command: Generate ArDoCo code model */
export const CONSTANTS_COMMAND_ARDOCO_GENERATE_MODEL = 'trace-viz.ardoCoGenerateModel';

/** Command: Generate ArDoCo trace links */
export const CONSTANTS_COMMAND_ARDOCO_GENERATE_LINKS = 'trace-viz.ardoCoGenerateLinks';

/** Command: Generate SAD-Code trace links */
export const CONSTANTS_COMMAND_SAD_CODE = 'trace-viz.sadCode';

/** Command: Generate SAM-Code trace links */
export const CONSTANTS_COMMAND_SAM_CODE = 'trace-viz.samCode';

/** Command: Generate SAD-SAM trace links */
export const CONSTANTS_COMMAND_SAD_SAM = 'trace-viz.sadSam';

/** Command: Generate SAD-SAM-Code trace links */
export const CONSTANTS_COMMAND_SAD_SAM_CODE = 'trace-viz.sadSamCode';

/** Command: Show visualization */
export const CONSTANTS_COMMAND_SHOW_VISUALIZATION = 'trace-viz.showVisualization';

/** Command: Hide visualization */
export const CONSTANTS_COMMAND_HIDE_VISUALIZATION = 'trace-viz.hideVisualization';

/** Command: Cycle visualization color */
export const CONSTANTS_COMMAND_CYCLE_VISUALIZATION_COLOR = 'trace-viz.cycleVisualizationColor';

/** Command: Open documentation */
export const CONSTANTS_COMMAND_OPEN_DOCUMENTATION = 'trace-viz.openDocumentation';

/** Command: Open CSV */
export const CONSTANTS_COMMAND_OPEN_CSV = 'trace-viz.openCsv';

/** Command: Compress history CSV */
export const CONSTANTS_COMMAND_COMPRESS_HISTORY_CSV = 'trace-viz.compressHistoryCsv';

/** Command: Refresh approach view */
export const CONSTANTS_COMMAND_REFRESH_APPROACH = 'trace-viz.refreshApproach';

/** Command: Jump to code from line (visualization) */
export const CONSTANTS_COMMAND_VIZ_JUMP_TO_CODE_FROM_LINE = 'trace-viz.viz.jumpToCodeFromLine';

// ============================================================================
// VIEW IDS
// ============================================================================

/** View ID: Traceability Approach */
export const CONSTANTS_VIEW_ID_APPROACH = 'traceViz.approach';

/** View ID: Trace History */
export const CONSTANTS_VIEW_ID_HISTORY = 'traceViz.history';

// ============================================================================
// CONTEXT VALUES
// ============================================================================

/** Context value: Approach item */
export const CONSTANTS_CONTEXT_APPROACH_ITEM = 'traceViz.approachItem';

/** Context value: ArDoCo item */
export const CONSTANTS_CONTEXT_ARDOCO_ITEM = 'traceViz.ardoCoItem';

/** Context value: ArDoCo config */
export const CONSTANTS_CONTEXT_ARDOCO_CONFIG = 'traceViz.ardoCoConfig';

/** Context value: ArDoCo generate model */
export const CONSTANTS_CONTEXT_ARDOCO_GENERATE_MODEL = 'traceViz.ardoCoGenerateModel';

/** Context value: ArDoCo generate links */
export const CONSTANTS_CONTEXT_ARDOCO_GENERATE_LINKS = 'traceViz.ardoCoGenerateLinks';

/** Context value: History item */
export const CONSTANTS_CONTEXT_HISTORY_ITEM = 'traceViz.historyItem';

/** Context value: History item active */
export const CONSTANTS_CONTEXT_HISTORY_ITEM_ACTIVE = 'traceViz.historyItem-active';

/** Context value: History item inactive */
export const CONSTANTS_CONTEXT_HISTORY_ITEM_INACTIVE = 'traceViz.historyItem-inactive';

/** Context value: SAM-Code */
export const CONSTANTS_CONTEXT_SAM_CODE = 'traceViz.samCode';

/** Context value: SAD-SAM */
export const CONSTANTS_CONTEXT_SAD_SAM = 'traceViz.sadSam';

/** Context value: SAD-SAM-Code */
export const CONSTANTS_CONTEXT_SAD_SAM_CODE = 'traceViz.sadSamCode';

/** Context value: SAD-Code */
export const CONSTANTS_CONTEXT_SAD_CODE = 'traceViz.sadCode';

// ============================================================================
// CONFIGURATION KEYS
// ============================================================================

/** Configuration section name */
export const CONSTANTS_CONFIG_SECTION = 'trace-viz';

/** Configuration key: Code Model Extractor JAR */
export const CONSTANTS_CONFIG_KEY_CODE_MODEL_EXTRACTOR_JAR = 'codeModelExtractorJar';

/** Configuration key: Documentation path (in ArDoCo config) */
export const CONSTANTS_CONFIG_KEY_DOCUMENTATION_PATH = 'documentationPath';

// ============================================================================
// NUMERIC CONSTANTS
// ============================================================================

/** Maximum number of active visualizations allowed */
export const CONSTANTS_NUMBER_MAX_ACTIVE_VISUALIZATIONS = 2;

/** Maximum number of colors in composite decoration */
export const CONSTANTS_NUMBER_MAX_COLORS_COMPOSITE = 2;

/** Minimum percentage for CSV compression by directory */
export const CONSTANTS_NUMBER_COMPRESS_MIN_PERCENT = 50;

/** Maximum polling attempts for async operations */
export const CONSTANTS_NUMBER_POLLING_MAX_ATTEMPTS = 5;

/** Polling wait time in milliseconds */
export const CONSTANTS_NUMBER_POLLING_WAIT_MS = 60000;

/** JSON indentation spaces */
export const CONSTANTS_NUMBER_JSON_INDENT = 2;

/** Status bar priority: Blue visualization */
export const CONSTANTS_NUMBER_STATUS_BAR_PRIORITY_BLUE = 99;

/** Status bar priority: Red visualization */
export const CONSTANTS_NUMBER_STATUS_BAR_PRIORITY_RED = 98;

/** Status bar priority: Orange visualization */
export const CONSTANTS_NUMBER_STATUS_BAR_PRIORITY_ORANGE = 97;

/** Status bar priority: Green visualization */
export const CONSTANTS_NUMBER_STATUS_BAR_PRIORITY_GREEN = 96;

/** SVG width in pixels */
export const CONSTANTS_NUMBER_SVG_WIDTH = 16;

/** SVG height in pixels */
export const CONSTANTS_NUMBER_SVG_HEIGHT = 16;

/** SVG circle center X coordinate */
export const CONSTANTS_NUMBER_SVG_CIRCLE_CENTER_X = 8;

/** SVG circle center Y coordinate */
export const CONSTANTS_NUMBER_SVG_CIRCLE_CENTER_Y = 8;

/** SVG circle radius */
export const CONSTANTS_NUMBER_SVG_CIRCLE_RADIUS = 3.5;

/** SVG circle stroke width */
export const CONSTANTS_NUMBER_SVG_CIRCLE_STROKE_WIDTH = 1;

/** SVG composite dot position for single dot */
export const CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_SINGLE = 8;

/** SVG composite dot position for first dot (two dots) */
export const CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_FIRST = 6;

/** SVG composite dot position for second dot (two dots) */
export const CONSTANTS_NUMBER_SVG_COMPOSITE_POSITION_SECOND = 11;

/** Minimum CSV columns required */
export const CONSTANTS_NUMBER_CSV_MIN_COLUMNS = 2;

// ============================================================================
// COLOR CONSTANTS
// ============================================================================

/** Hex color code for blue visualization */
export const CONSTANTS_COLOR_HEX_BLUE = '#1f6feb';

/** Hex color code for red visualization */
export const CONSTANTS_COLOR_HEX_RED = '#f85149';

/** Hex color code for orange visualization */
export const CONSTANTS_COLOR_HEX_ORANGE = '#d29922';

/** Hex color code for green visualization */
export const CONSTANTS_COLOR_HEX_GREEN = '#3fb950';

// ============================================================================
// DATE/TIME FORMAT CONSTANTS
// ============================================================================

/** Locale for date formatting */
export const CONSTANTS_DATE_LOCALE = 'de-DE';

/** Date format option: 2-digit month */
export const CONSTANTS_DATE_OPTION_MONTH_2_DIGIT = '2-digit';

/** Date format option: 2-digit day */
export const CONSTANTS_DATE_OPTION_DAY_2_DIGIT = '2-digit';

/** Date format option: 2-digit hour */
export const CONSTANTS_DATE_OPTION_HOUR_2_DIGIT = '2-digit';

/** Date format option: 2-digit minute */
export const CONSTANTS_DATE_OPTION_MINUTE_2_DIGIT = '2-digit';

/** Date format option: 2-digit second */
export const CONSTANTS_DATE_OPTION_SECOND_2_DIGIT = '2-digit';

/** Date format option: 24-hour format */
export const CONSTANTS_DATE_OPTION_HOUR_12_FALSE = false;

// ============================================================================
// STRING CONSTANTS
// ============================================================================

/** CSV header for sentence ID column */
export const CONSTANTS_STRING_CSV_HEADER_SENTENCE_ID = 'sentenceID';

/** CSV header for code ID column */
export const CONSTANTS_STRING_CSV_HEADER_CODE_ID = 'codeID';

/** CSV header row */
export const CONSTANTS_STRING_CSV_HEADER_ROW = 'sentenceID,codeID';

/** CSV header for sentence ID (lowercase for comparison) */
export const CONSTANTS_STRING_CSV_HEADER_SENTENCE_ID_LOWER = 'sentenceid';

/** Approach name: CSV Direct */
export const CONSTANTS_STRING_APPROACH_CSV_DIRECT = 'CSV Direct';

/** Approach name: SAD-Code */
export const CONSTANTS_STRING_APPROACH_SAD_CODE = 'SAD-Code';

/** VS Code command: Open file */
export const CONSTANTS_STRING_VSCODE_COMMAND_OPEN = 'vscode.open';

/** VS Code command: Reveal in explorer */
export const CONSTANTS_STRING_VSCODE_COMMAND_REVEAL_IN_EXPLORER = 'revealInExplorer';

/** VS Code command: Open user settings */
export const CONSTANTS_STRING_VSCODE_COMMAND_OPEN_USER_SETTINGS = 'workbench.action.openUserSettings';

/** VS Code command: Open workspace settings */
export const CONSTANTS_STRING_VSCODE_COMMAND_OPEN_WORKSPACE_SETTINGS = 'workbench.action.openWorkspaceSettings';

/** VS Code command: Open settings */
export const CONSTANTS_STRING_VSCODE_COMMAND_OPEN_SETTINGS = 'workbench.action.openSettings';

/** VS Code settings extension prefix */
export const CONSTANTS_STRING_VSCODE_SETTINGS_EXT_PREFIX = 'ext:trace-viz';

/** SVG namespace URL */
export const CONSTANTS_STRING_SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** SVG data URI prefix */
export const CONSTANTS_STRING_SVG_DATA_URI_PREFIX = 'data:image/svg+xml;base64,';

