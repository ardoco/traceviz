import * as vscode from 'vscode';
import * as path from 'path';
import {
    ArDoCoConfig,
    ARDOCO_RESPONSE_STATUS,
    ARDOCO_TRACE_LINK_TYPE,
    ArDoCoResponseStatus,
    ArDoCoTraceLinkType,
    ArDoCoTraceLink,
    SadCodeResponse
} from '../types';
import { Logger } from './logger.util';
import { toUri } from './uri.util';

/**
 * Options for starting a trace link generation request
 */
export interface StartTraceLinkRequestOptions {
    /** Type of trace link to generate */
    traceLinkType: ArDoCoTraceLinkType;
    /** Path to documentation file */
    documentationPath?: string;
    /** Path to code model file */
    codeModelFile?: string;
    /** Path to architecture model file */
    architectureModelPath?: string;
    /** Format of the architecture model (PCM, UML, COMPONENT_LISTING, ACM) */
    architectureModelFormat?: string;
}

/**
 * Response from starting a trace link generation request
 */
export interface StartTraceLinkResponse {
    /** Request ID for tracking the async operation */
    requestId: string;
    /** Status of the request */
    status: ArDoCoResponseStatus;
    /** Status message */
    message: string;
}

/**
 * Result object from the API response
 */
export interface ArDoCoResult {
    /** Array of inconsistencies found */
    inconsistencies: any[];
    /** Array of trace links connecting sentences to code locations */
    traceLinks: ArDoCoTraceLink[];
}

/**
 * Result from polling for trace link generation results
 */
export interface PollResultResponse {
    /** Status message from the API */
    message: string;
    /** Request ID for tracking the async operation */
    requestId: string;
    /** Result object containing trace links and inconsistencies */
    result?: ArDoCoResult;
    /** Legacy status field (for backward compatibility) */
    status?: ArDoCoResponseStatus;
    /** Legacy trace links field (for backward compatibility) */
    traceLinks?: any[];
}

/**
 * Options for polling for results
 */
export interface PollOptions {
    /** Maximum number of polling attempts */
    maxAttempts?: number;
    /** Delay between polling attempts in milliseconds */
    pollInterval?: number;
    /** Callback for progress updates */
    onProgress?: (attempt: number, maxAttempts: number) => void;
}

/**
 * Utility class for communicating with the ArDoCo REST API
 */
export class ArDoCoApiUtil {
    /**
     * Gets the API endpoint URL for a specific trace link type
     */
    private static getEndpointUrl(traceLinkType: ArDoCoTraceLinkType): string {
        const endpointMap: Record<ArDoCoTraceLinkType, string> = {
            [ARDOCO_TRACE_LINK_TYPE.SAD_CODE]: 'ardocode',
            [ARDOCO_TRACE_LINK_TYPE.SAM_CODE]: 'arcotl',
            [ARDOCO_TRACE_LINK_TYPE.SAD_SAM]: 'swattr',
            [ARDOCO_TRACE_LINK_TYPE.SAD_SAM_CODE]: 'transarc'
        };
        return endpointMap[traceLinkType] || 'ardocode';
    }

    /**
     * Reads a workspace file through the VS Code file system API (works on desktop and in VS Code for the Web)
     */
    private static async readFileBlob(filePath: string, type?: string): Promise<Blob> {
        const data = await vscode.workspace.fs.readFile(toUri(filePath));
        return new Blob([data as Uint8Array<ArrayBuffer>], type ? { type } : undefined);
    }

    /**
     * Gets the base URL of the REST API without trailing slashes
     */
    private static getBaseUrl(config: ArDoCoConfig): string {
        return config.restApiUrl.replace(/\/+$/, '');
    }

    /**
     * Prepares form data for trace link generation request
     */
    private static async prepareFormData(options: StartTraceLinkRequestOptions): Promise<FormData> {
        const formData = new FormData();

        if (options.documentationPath) {
            formData.append('inputText', await this.readFileBlob(options.documentationPath, 'text/plain'), path.basename(options.documentationPath));
            Logger.debug('Added inputText to form data:', options.documentationPath);
        }

        if (options.codeModelFile) {
            formData.append('inputCode', await this.readFileBlob(options.codeModelFile), path.basename(options.codeModelFile));
            Logger.debug('Added inputCode to form data:', options.codeModelFile);
        }

        if (options.architectureModelPath) {
            formData.append('inputArchitectureModel', await this.readFileBlob(options.architectureModelPath), path.basename(options.architectureModelPath));
            Logger.debug('Added inputArchitectureModel to form data:', options.architectureModelPath);
        }

        return formData;
    }

    /**
     * Makes an HTTP request to the ArDoCo API
     */
    private static async makeRequest(
        url: string,
        method: 'GET' | 'POST' = 'GET',
        body?: FormData
    ): Promise<Response> {
        Logger.info(`${method} request to:`, url);

        // The multipart content type (with boundary) is set by fetch from the FormData body
        const response = await fetch(url, {
            method,
            headers: { 'accept': 'application/json' },
            body
        });

        Logger.debug('Response status:', response.status);
        return response;
    }

    /**
     * Handles API response errors
     */
    private static async handleErrorResponse(response: Response): Promise<never> {
        const responseText = await response.text();
        Logger.error('API error response:', {
            status: response.status,
            statusText: response.statusText,
            body: responseText
        });
        throw new Error(`ArDoCo API error: ${response.status} ${response.statusText} - ${responseText}`);
    }

    /**
     * Starts a trace link generation request
     * @param config ArDoCo configuration
     * @param options Options for the trace link generation
     * @returns Response with request ID
     */
    static async startTraceLinkGeneration(
        config: ArDoCoConfig,
        options: StartTraceLinkRequestOptions
    ): Promise<StartTraceLinkResponse> {
        const endpoint = this.getEndpointUrl(options.traceLinkType);
        let requestUrl = `${this.getBaseUrl(config)}/api/${endpoint}/start?projectName=${encodeURIComponent(config.projectName)}`;
        if (options.architectureModelFormat) {
            requestUrl += `&inputArchitectureModelFormat=${encodeURIComponent(options.architectureModelFormat)}`;
        }
        
        const formData = await this.prepareFormData(options);
        Logger.debug('Form data prepared for', options.traceLinkType);

        const response = await this.makeRequest(requestUrl, 'POST', formData);

        if (!response.ok) {
            await this.handleErrorResponse(response);
        }

        const result = await response.json() as StartTraceLinkResponse;
        Logger.debug('Start trace link response:', result);

        if (result.status === ARDOCO_RESPONSE_STATUS.OK && result.requestId) {
            Logger.info('Trace link generation started successfully, requestId:', result.requestId);
            return result;
        } else {
            Logger.error('Failed to start trace link generation:', result);
            throw new Error(result.message || 'Unknown error occurred');
        }
    }

    /**
     * Polls for trace link generation results
     * @param config ArDoCo configuration
     * @param requestId Request ID from the start request
     * @param options Polling options
     * @returns Result response when completed
     */
    static async pollForResults(
        config: ArDoCoConfig,
        requestId: string,
        options: PollOptions = {}
    ): Promise<PollResultResponse> {
        const maxAttempts = options.maxAttempts || 5;
        const pollInterval = options.pollInterval || 60000; // Default 60 seconds
        let attempts = 0;

        while (attempts < maxAttempts) {
            attempts++;
            
            if (options.onProgress) {
                options.onProgress(attempts, maxAttempts);
            }

            Logger.debug(`Polling attempt ${attempts}/${maxAttempts} for requestId: ${requestId}`);

            const requestUrl = `${this.getBaseUrl(config)}/api/wait-for-result/${requestId}`;
            const response = await this.makeRequest(requestUrl, 'GET');

            if (!response.ok) {
                await this.handleErrorResponse(response);
            }

            const result = await response.json() as PollResultResponse;
            Logger.debug('Polling result:', JSON.stringify(result, null, 2));

            // Check if result is ready (new API format with result object)
            if (result.result && result.result.traceLinks) {
                Logger.info('Trace link generation completed successfully');
                // Normalize the response to include traceLinks at top level for compatibility
                return {
                    ...result,
                    traceLinks: result.result.traceLinks
                };
            }
            
            // Legacy status-based check (for backward compatibility)
            if (result.status === ARDOCO_RESPONSE_STATUS.OK || result.status === ARDOCO_RESPONSE_STATUS.COMPLETED) {
                Logger.info('Trace link generation completed successfully');
                return result;
            } else if (result.status === ARDOCO_RESPONSE_STATUS.ERROR) {
                Logger.error('Trace link generation failed:', result.message);
                throw new Error(result.message || 'Trace link generation failed');
            } else {
                // Still processing - continue polling
                Logger.debug('Result not ready yet, message:', result.message);
                if (attempts < maxAttempts) {
                    Logger.debug(`Waiting ${pollInterval}ms before next attempt...`);
                    await new Promise(resolve => setTimeout(resolve, pollInterval));
                } else {
                    throw new Error(`Timeout waiting for results after ${maxAttempts} attempts`);
                }
            }
        }

        throw new Error(`Timeout waiting for results after ${maxAttempts} attempts`);
    }

    /**
     * Starts trace link generation and polls for results in one call
     * @param config ArDoCo configuration
     * @param options Options for the trace link generation
     * @param pollOptions Polling options
     * @returns Final result with trace links
     */
    static async generateTraceLinks(
        config: ArDoCoConfig,
        options: StartTraceLinkRequestOptions,
        pollOptions?: PollOptions
    ): Promise<PollResultResponse> {
        const startResponse = await this.startTraceLinkGeneration(config, options);
        return await this.pollForResults(config, startResponse.requestId, pollOptions);
    }
}

