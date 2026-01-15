/**
 * Types related to ArDoCo integration
 */

/**
 * Configuration for ArDoCo traceability approach
 */
export interface ArDoCoConfig {
    /** URL of the ArDoCo REST API */
    restApiUrl: string;
    /** Path to the Code Model Extractor JAR file */
    jarPath: string;
    /** Name of the project */
    projectName: string;
    /** Path to the source code directory */
    codePath: string;
    /** Path to the documentation file */
    documentationPath: string;
    /** Path to the architecture model file (optional) */
    architectureModelPath: string;
}

/**
 * Dictionary of possible ArDoCo API response status values
 */
export const ARDOCO_RESPONSE_STATUS = {
    /** Request was accepted and is being processed */
    OK: 'OK',
    /** Request completed successfully */
    COMPLETED: 'COMPLETED',
    /** Request failed with an error */
    ERROR: 'ERROR',
    /** Request is still being processed */
    PROCESSING: 'PROCESSING'
} as const;

/**
 * Type for ArDoCo API response status values
 */
export type ArDoCoResponseStatus = typeof ARDOCO_RESPONSE_STATUS[keyof typeof ARDOCO_RESPONSE_STATUS];

/**
 * Dictionary of possible trace link types
 */
export const ARDOCO_TRACE_LINK_TYPE = {
    /** SAD-Code trace links (Software Architecture Documentation to Code) */
    SAD_CODE: 'SAD-Code',
    /** SAM-Code trace links (Software Architecture Model to Code) */
    SAM_CODE: 'SAM-Code',
    /** SAD-SAM trace links (Software Architecture Documentation to Software Architecture Model) */
    SAD_SAM: 'SAD-SAM',
    /** SAD-SAM-Code trace links (combined approach) */
    SAD_SAM_CODE: 'SAD-SAM-Code'
} as const;

/**
 * Type for ArDoCo trace link types
 */
export type ArDoCoTraceLinkType = typeof ARDOCO_TRACE_LINK_TYPE[keyof typeof ARDOCO_TRACE_LINK_TYPE];

/**
 * Represents a single trace link entry from ArDoCo API
 */
export interface ArDoCoTraceLink {
    /** Sentence number in the documentation (1-based, as string from API) */
    sentenceNumber: string | number;
    /** Code element ID from the code model */
    codeElementId: string;
    /** Code element name */
    codeElementName: string;
    /** Legacy field: Code compilation unit path (file or directory) - for backward compatibility */
    codeCompilationUnit?: string;
}

/**
 * Response from ArDoCo SAD-Code API
 */
export interface SadCodeResponse {
    /** Request ID for tracking the async operation */
    requestId: string;
    /** Status of the request */
    status: ArDoCoResponseStatus;
    /** Status message */
    message: string;
    /** Type of trace links generated */
    traceLinkType: ArDoCoTraceLinkType;
    /** Array of trace links connecting sentences to code locations */
    traceLinks: ArDoCoTraceLink[];
}
