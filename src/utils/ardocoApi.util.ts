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
import {
    CONSTANTS_NUMBER_POLLING_BACKOFF_FACTOR,
    CONSTANTS_NUMBER_POLLING_INITIAL_INTERVAL_MS,
    CONSTANTS_NUMBER_POLLING_MAX_INTERVAL_MS,
    CONSTANTS_NUMBER_POLLING_TIMEOUT_MS
} from '../constants';
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
    /** Initial delay between polling attempts in milliseconds (grows by the backoff factor up to `maxPollInterval`) */
    pollInterval?: number;
    /** Maximum delay between polling attempts in milliseconds */
    maxPollInterval?: number;
    /** Overall timeout in milliseconds, counted from the first poll */
    timeout?: number;
    /** Aborts polling and the request in flight; polling then rejects with a PollCancelledError */
    signal?: AbortSignal;
    /** Callback for progress updates (attempt number and milliseconds waited so far) */
    onProgress?: (attempt: number, elapsedMs: number) => void;
}

/**
 * Thrown when polling is aborted through the abort signal (e.g. the user cancelled the progress notification)
 */
export class PollCancelledError extends Error {
    constructor() {
        super('Trace link generation was cancelled');
        this.name = 'PollCancelledError';
    }
}

/** Waits for the given time; rejects with a PollCancelledError as soon as the signal is aborted */
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new PollCancelledError());
            return;
        }
        const onAbort = () => {
            clearTimeout(timer);
            reject(new PollCancelledError());
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
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
        body?: FormData,
        signal?: AbortSignal
    ): Promise<Response> {
        Logger.info(`${method} request to:`, url);

        // The multipart content type (with boundary) is set by fetch from the FormData body
        const response = await fetch(url, {
            method,
            headers: { 'accept': 'application/json' },
            body,
            signal
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
     * Polls for trace link generation results. The wait between polls starts at `pollInterval` and grows
     * by CONSTANTS_NUMBER_POLLING_BACKOFF_FACTOR up to `maxPollInterval`; polling gives up after `timeout`.
     * @param config ArDoCo configuration
     * @param requestId Request ID from the start request
     * @param options Polling options
     * @returns Result response when completed
     * @throws PollCancelledError if the abort signal fires, an Error on timeout or API errors
     */
    static async pollForResults(
        config: ArDoCoConfig,
        requestId: string,
        options: PollOptions = {}
    ): Promise<PollResultResponse> {
        const maxInterval = options.maxPollInterval ?? CONSTANTS_NUMBER_POLLING_MAX_INTERVAL_MS;
        const timeout = options.timeout ?? CONSTANTS_NUMBER_POLLING_TIMEOUT_MS;
        let interval = options.pollInterval ?? CONSTANTS_NUMBER_POLLING_INITIAL_INTERVAL_MS;
        const startedAt = Date.now();
        let attempts = 0;

        while (true) {
            attempts++;
            options.onProgress?.(attempts, Date.now() - startedAt);
            Logger.debug(`Polling attempt ${attempts} for requestId: ${requestId}`);

            const requestUrl = `${this.getBaseUrl(config)}/api/wait-for-result/${requestId}`;
            let response: Response;
            try {
                response = await this.makeRequest(requestUrl, 'GET', undefined, options.signal);
            } catch (error) {
                if (options.signal?.aborted) {
                    throw new PollCancelledError();
                }
                throw error;
            }

            if (!response.ok) {
                await this.handleErrorResponse(response);
            }

            let result: PollResultResponse;
            try {
                result = await response.json() as PollResultResponse;
            } catch (error) {
                if (options.signal?.aborted) {
                    throw new PollCancelledError();
                }
                throw error;
            }
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
            }

            // Still processing - wait with backoff and poll again, unless the timeout is reached
            Logger.debug('Result not ready yet, message:', result.message);
            if (Date.now() - startedAt + interval >= timeout) {
                throw new Error(`Timeout waiting for results after ${Math.round((Date.now() - startedAt) / 1000)} s`);
            }
            Logger.debug(`Waiting ${interval}ms before next attempt...`);
            await abortableDelay(interval, options.signal);
            interval = Math.min(maxInterval, Math.round(interval * CONSTANTS_NUMBER_POLLING_BACKOFF_FACTOR));
        }
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

