import * as vscode from 'vscode';

/**
 * Log levels in order of severity (higher number = more severe)
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

/**
 * Dictionary of log level names
 */
export const LOG_LEVEL = {
    DEBUG: LogLevel.DEBUG,
    INFO: LogLevel.INFO,
    WARN: LogLevel.WARN,
    ERROR: LogLevel.ERROR
} as const;

/**
 * Logger utility for the trace-viz extension
 * Provides structured logging with configurable log levels
 */
export class Logger {
    private static outputChannel: vscode.OutputChannel | undefined;
    private static currentLogLevel: LogLevel = LogLevel.INFO;
    private static readonly CHANNEL_NAME = 'Trace Viz';

    /**
     * Initializes the logger with an output channel
     * @param context VS Code extension context
     */
    static initialize(context: vscode.ExtensionContext): void {
        this.outputChannel = vscode.window.createOutputChannel(this.CHANNEL_NAME);
        context.subscriptions.push(this.outputChannel);
        
        // Load log level from configuration
        this.updateLogLevel();
        
        // Listen for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('trace-viz.logLevel')) {
                    this.updateLogLevel();
                }
            })
        );
    }

    /**
     * Updates the log level from VS Code configuration
     */
    private static updateLogLevel(): void {
        const config = vscode.workspace.getConfiguration('trace-viz');
        const levelName = config.get<string>('logLevel', 'INFO').toUpperCase();
        
        switch (levelName) {
            case 'DEBUG':
                this.currentLogLevel = LogLevel.DEBUG;
                break;
            case 'INFO':
                this.currentLogLevel = LogLevel.INFO;
                break;
            case 'WARN':
                this.currentLogLevel = LogLevel.WARN;
                break;
            case 'ERROR':
                this.currentLogLevel = LogLevel.ERROR;
                break;
            default:
                this.currentLogLevel = LogLevel.INFO;
        }
    }

    /**
     * Sets the log level programmatically
     * @param level Log level to set
     */
    static setLogLevel(level: LogLevel): void {
        this.currentLogLevel = level;
    }

    /**
     * Gets the current log level
     * @returns Current log level
     */
    static getLogLevel(): LogLevel {
        return this.currentLogLevel;
    }

    /**
     * Formats a log message with timestamp and level
     */
    private static formatMessage(level: string, message: string, ...args: any[]): string {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ') : '';
        return `[${timestamp}] [${level}] ${message}${formattedArgs}`;
    }

    /**
     * Writes a message to the output channel if the log level allows it
     */
    private static write(level: LogLevel, levelName: string, message: string, ...args: any[]): void {
        if (level < this.currentLogLevel) {
            return;
        }

        if (!this.outputChannel) {
            // Fallback to console if output channel not initialized
            const consoleMethod = level === LogLevel.ERROR ? console.error : 
                                 level === LogLevel.WARN ? console.warn : 
                                 console.log;
            consoleMethod(this.formatMessage(levelName, message, ...args));
            return;
        }

        const formatted = this.formatMessage(levelName, message, ...args);
        this.outputChannel.appendLine(formatted);
        
        // Show output channel for errors and warnings
        if (level >= LogLevel.WARN) {
            this.outputChannel.show(true);
        }
    }

    /**
     * Logs a debug message (only shown when log level is DEBUG)
     * @param message Message to log
     * @param args Additional arguments to log
     */
    static debug(message: string, ...args: any[]): void {
        this.write(LogLevel.DEBUG, 'DEBUG', message, ...args);
    }

    /**
     * Logs an info message (shown when log level is INFO or lower)
     * @param message Message to log
     * @param args Additional arguments to log
     */
    static info(message: string, ...args: any[]): void {
        this.write(LogLevel.INFO, 'INFO', message, ...args);
    }

    /**
     * Logs a warning message (shown when log level is WARN or lower)
     * @param message Message to log
     * @param args Additional arguments to log
     */
    static warn(message: string, ...args: any[]): void {
        this.write(LogLevel.WARN, 'WARN', message, ...args);
    }

    /**
     * Logs an error message (always shown)
     * @param message Message to log
     * @param args Additional arguments to log
     */
    static error(message: string, ...args: any[]): void {
        this.write(LogLevel.ERROR, 'ERROR', message, ...args);
    }

    /**
     * Logs an error with stack trace
     * @param message Error message
     * @param error Error object
     */
    static errorWithStack(message: string, error: Error | unknown): void {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        this.error(message, errorObj.message);
        if (errorObj.stack) {
            this.debug('Stack trace:', errorObj.stack);
        }
    }

    /**
     * Shows the output channel
     */
    static show(): void {
        this.outputChannel?.show(true);
    }

    /**
     * Clears the output channel
     */
    static clear(): void {
        this.outputChannel?.clear();
    }
}

