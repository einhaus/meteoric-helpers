/* eslint-disable @typescript-eslint/no-unused-vars */
import { getDate } from '../date/getDate.js';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { workerData } from 'worker_threads';
import path from 'path';
import { checkTimezoneIsEst } from '../index.js';
import { nanoid } from 'nanoid';

export interface LoggerConfig {
    logDir: string;
    jobLogDir?: string;
    verbose?: boolean;
    debug?: boolean;
    duplicateSuppressionWindowMs?: number; // Default: 5 minutes
    enableDuplicateSuppression?: boolean; // Default: true
}

export interface LogEntry {
    level: 'info' | 'error' | 'warn' | 'debug';
    service?: string;
    category?: string;
    severity: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
    message?: string;
    error?: Error;
    extraData?: unknown;
}

export interface LoggerRecord {
    timestamp: string;
    unixTimestamp: number;
    service: string;
    category: string;
    level: string;
    severity: number;
    message: string;
    error: LoggerError | undefined;
    extraData: string;
    context: LoggerContext;
}

export interface LoggerError {
    name: string;
    message: string;
    stack: string | undefined;
    cause?: string;
}

export interface LoggerContext {
    argString: string;
    workerJson: string;
    scriptInstanceId: string;
    processId: number;
    uptime: number;
    nodeVersion: string;
    platform: string;
}

export class Logger {
    verbose = false;
    debug = false;
    private readonly scriptInstanceId: string;
    private readonly logDir: string;
    private readonly jobLogDir: string;
    private readonly recentErrors = new Map<string, number>();
    private readonly duplicateSuppressionWindowMs: number;
    private readonly enableDuplicateSuppression: boolean;

    // Add recursion protection and original console methods
    private isLogging = false;
    private readonly originalConsoleError: typeof console.error;
    private readonly originalConsoleLog: typeof console.log;

    private static instance: Logger | null = null;

    private constructor(config?: LoggerConfig) {
        this.verbose = config?.verbose ?? false;

        // Store original console methods before they get overridden
        this.originalConsoleError = console.error;
        this.originalConsoleLog = console.log;

        // Initialize duplicate suppression settings
        this.duplicateSuppressionWindowMs = config?.duplicateSuppressionWindowMs ?? 300000; // 5 minutes default
        this.enableDuplicateSuppression = config?.enableDuplicateSuppression ?? true;

        this.setupProcessHandlers();
        this.debug = config?.debug ?? false;
        this.scriptInstanceId = nanoid();
        Error.stackTraceLimit = 25;
        checkTimezoneIsEst();

        // Set log directories from config or use defaults
        this.logDir = config?.logDir ? `${path.resolve(config.logDir)}/` : `${path.resolve('./logs/')}/`;
        this.jobLogDir = config?.jobLogDir ? `${path.resolve(config.jobLogDir)}/` : `${this.logDir}jobLogs/`;

        // Ensure log directories exist
        if (!existsSync(this.logDir)) {
            mkdirSync(this.logDir, { recursive: true });
        }

        if (!existsSync(`${this.logDir}files`)) {
            mkdirSync(`${this.logDir}files`, { recursive: true });
        }

        if (!existsSync(this.jobLogDir)) {
            mkdirSync(this.jobLogDir, { recursive: true });
        }
    }

    /**
     * Get the singleton instance of Logger
     * @param config Optional configuration for log directories
     * @returns The Logger instance
     */
    public static getInstance(config?: LoggerConfig): Logger {
        if (!Logger.instance) {
            if (!config) throw new Error('Logger config is required');
            // If no config is provided, use default log directory
            const logConfig: LoggerConfig = config;
            Logger.instance = new Logger(logConfig);
        }

        return Logger.instance;
    }

    /**
     * Clean up expired entries from the recent errors map
     */
    private cleanupExpiredErrors(): void {
        if (!this.enableDuplicateSuppression) return;

        const now = Date.now();
        const expiredKeys: string[] = [];

        for (const [key, timestamp] of this.recentErrors.entries()) {
            if (now - timestamp > this.duplicateSuppressionWindowMs) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            this.recentErrors.delete(key);
        }
    }

    /**
     * Generate a more comprehensive hash for duplicate detection
     */
    private generateErrorHash(config: LogEntry): string {
        const { error, message, service, category, level } = config;

        // Include more context in the hash to reduce false positives
        const parts = [level, service || '', category || '', error ? `${error.name}:${error.message}` : message || ''];

        return parts.join('|');
    }

    /**
     * Check if this error should be suppressed as a duplicate
     */
    private isDuplicate(config: LogEntry): boolean {
        if (!this.enableDuplicateSuppression) return false;

        // Clean up expired entries first
        this.cleanupExpiredErrors();

        const errorHash = this.generateErrorHash(config);
        if (!errorHash) return false;

        return this.recentErrors.has(errorHash);
    }

    /**
     * Record this error in the recent errors map
     */
    private recordError(config: LogEntry): void {
        if (!this.enableDuplicateSuppression) return;

        const errorHash = this.generateErrorHash(config);

        if (errorHash) {
            this.recentErrors.set(errorHash, Date.now());
        }
    }

    // eslint-disable-next-line max-statements, complexity
    log(config: LogEntry): void {
        // Prevent infinite recursion
        if (this.isLogging) {
            this.originalConsoleError('Logger: Recursive call detected, skipping log entry');
            return;
        }

        const { level, severity, message, error, extraData, service, category } = config;

        this.isLogging = true;

        try {
            Error.stackTraceLimit = Infinity;

            const argString = process.argv.slice(1).join(' ');
            let workerJson = '';

            // Safe JSON serialization for worker data
            if (workerData) {
                try {
                    workerJson = JSON.stringify(workerData);
                } catch (_err) {
                    workerJson = '[Unable to serialize worker data]';
                }
            }

            let extraDataOutput = typeof extraData === 'string' ? extraData : '';
            extraDataOutput = extraData instanceof Error ? extraData.message : extraDataOutput;
            extraDataOutput = extraData instanceof TypeError ? extraData.message : extraDataOutput;

            // Safe JSON serialization for extra data
            if (!extraDataOutput && extraData) {
                try {
                    extraDataOutput = JSON.stringify(extraData, null, 4);
                } catch (_err) {
                    extraDataOutput = '[Unable to serialize extra data]';
                }
            }

            // Enhanced error serialization - capture more error context
            let errorDetails: LoggerError | undefined;

            if (error) {
                try {
                    const baseErrorDetails: LoggerError = {
                        name: error.name,
                        message: error.message,
                        stack: error.stack
                    };

                    // Only add cause if it exists
                    if (error.cause) {
                        baseErrorDetails.cause = JSON.stringify(error.cause);
                    }

                    errorDetails = {
                        ...baseErrorDetails,
                        // Capture any custom properties on the error object
                        ...Object.getOwnPropertyNames(error).reduce(
                            (acc: Record<string, unknown>, key) => {
                                if (!['name', 'message', 'stack'].includes(key)) {
                                    acc[key] = (error as unknown as Record<string, unknown>)[key];
                                }

                                return acc;
                            },
                            {} as Record<string, unknown>
                        )
                    };
                } catch (_err) {
                    // Fallback if error serialization fails
                    errorDetails = {
                        name: error.name || 'Unknown',
                        message: error.message || 'Unknown error',
                        stack: error.stack || 'No stack trace available'
                    };
                }
            }

            // Get current timestamp for consistent timing
            const timestamp = getDate({ format: 'ymdhms' });
            const unixTimestamp = Date.now();

            const logEntry: LoggerRecord = {
                timestamp,
                unixTimestamp,
                level,
                severity,
                message: message ?? '',
                error: errorDetails,
                extraData: extraDataOutput,
                context: {
                    argString,
                    workerJson,
                    scriptInstanceId: this.scriptInstanceId,
                    processId: process.pid,
                    uptime: process.uptime(),
                    nodeVersion: process.version,
                    platform: process.platform
                },
                service: service ?? '',
                category: category ?? ''
            };

            // Check for duplicate errors before proceeding
            if (this.isDuplicate(config)) {
                return; // Skip duplicate
            }

            // Better file naming - group by date and level for easier analysis
            const dateStr = timestamp.substring(0, 10); // YYYYMMDD
            const filename = `${this.logDir}files/${dateStr}_${level}_${nanoid(8)}.json`;

            // Record this error to prevent future duplicates
            this.recordError(config);

            try {
                // Safe JSON serialization for log entry
                const logEntryJson = JSON.stringify(logEntry);
                writeFileSync(filename, logEntryJson);
            } catch (err) {
                // Use original console methods to prevent recursion
                this.originalConsoleLog('Failed to write log file:', err);

                // Try to output a simplified version
                try {
                    const simplifiedEntry = {
                        timestamp,
                        level,
                        message: message ?? '',
                        error: error ? { name: error.name, message: error.message } : undefined
                    };

                    this.originalConsoleLog('Simplified log entry:', JSON.stringify(simplifiedEntry, null, 2));
                } catch (_fallbackErr) {
                    this.originalConsoleLog('Log entry (raw):', level, message);
                }
            }
        } finally {
            this.isLogging = false;
        }
    }

    private setupProcessHandlers() {
        this.verbose = !!process.argv.includes('--verbose');
        this.debug = !!process.argv.includes('--debug');

        process.env.TZ = 'America/New_York';

        console.error = (...args: unknown[]) => {
            // Prevent recursion by checking if we're already logging
            if (this.isLogging) {
                this.originalConsoleError('Logger: Recursive console.error call detected');
                this.originalConsoleError(...args);
                return;
            }

            // Safe argument processing to prevent JSON.stringify failures
            let errorMessage = '';

            try {
                errorMessage = args
                    .map((arg) => {
                        if (typeof arg === 'string') return arg;
                        if (arg instanceof Error) return arg.message;

                        try {
                            return JSON.stringify(arg);
                        } catch {
                            return '[Unable to serialize argument]';
                        }
                    })
                    .join(' ');
            } catch {
                errorMessage = 'Error processing console.error arguments';
            }

            if (errorMessage.includes('punycode')) return;

            // Create an Error object to capture stack trace
            const error = new Error(errorMessage);

            this.log({
                level: 'error',
                severity: 8,
                message: errorMessage,
                error
            });

            // Call the original console.error to maintain normal behavior
            this.originalConsoleError.apply(console, args);
        };

        process.on('uncaughtException', (err, origin) => {
            // Use original console methods to prevent recursion in critical scenarios
            this.originalConsoleLog(err);
            this.originalConsoleLog(origin);

            // Safe JSON serialization for origin
            let originMessage = '';

            try {
                originMessage = JSON.stringify(origin);
            } catch {
                originMessage = String(origin);
            }

            this.log({
                level: 'error',
                severity: 10,
                message: `uncaughtException: ${originMessage}`,
                error: err
            });

            process.exit(1);
        });

        process.on('SIGTERM', () => {
            this.log({
                level: 'error',
                severity: 10,
                message: 'SIGTERM received',
                error: new Error('SIGTERM received')
            });

            process.exit(1);
        });

        process.on('unhandledRejection', (reason) => {
            const errorMessage = reason instanceof Error ? reason.stack : reason;
            const error = new Error(`Unhandled Rejection at: Promise ${errorMessage as string}`);

            // Safe JSON serialization for reason
            let reasonMessage = '';

            try {
                reasonMessage = JSON.stringify(reason);
            } catch {
                reasonMessage = String(reason);
            }

            this.log({
                level: 'error',
                severity: 10,
                message: `unhandledRejection: ${reasonMessage}`,
                error
            });

            process.exit(1);
        });

        process.on('warning', (warning) => {
            // TODO - at some point we can remove this
            if (warning.message.includes('punycode')) return;

            this.log({
                level: 'warn',
                severity: 5,
                message: warning.message,
                error: warning
            });
        });
    }

    setVerbose(verbose: boolean): void {
        this.verbose = verbose;
    }

    setDebug(debug: boolean): void {
        this.debug = debug;
    }

    /**
     * Initialize the logger with optional configuration
     * @param config Optional configuration for log directories
     * @returns The Logger instance
     */
    static init(config?: LoggerConfig): Logger {
        const instance = Logger.getInstance(config);

        if (instance.verbose) {
            console.log('Logger initialized');
            console.log(`Log directory: ${instance.logDir}`);
            console.log(`Job log directory: ${instance.jobLogDir}`);
        }

        return instance;
    }

    /**
     * Instance method for backward compatibility
     * This method is called after getting an instance through Logger
     * in applications using TypeDI
     */
    init(): void {
        if (this.verbose) console.log('Logger initialized');
    }
}
