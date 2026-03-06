/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { getDate } from '../date/getDate.js';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { isMainThread, threadId, workerData } from 'worker_threads';
import path from 'path';
import { checkTimezoneIsEst } from '../index.js';
import { nanoid } from 'nanoid';
import os from 'os';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type LoggerRuntimeName = 'bun' | 'node' | 'unknown';

export interface LoggerConfig {
    logDir: string;
    jobLogDir?: string;
    verbose?: boolean;
    debug?: boolean;
    duplicateSuppressionWindowMs?: number; // Default: 5 minutes
    enableDuplicateSuppression?: boolean; // Default: true
    outputSeverity?: number; // Default: 7
}

export interface LogEntry {
    level: 'info' | 'error' | 'warn' | 'debug' | 'job';
    service?: string;
    category?: string;
    severity: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
    message?: string;
    error?: Error;
    extraData?: unknown;
}

export interface LoggerRecord {
    timestamp: string;
    unix_timestamp: number;
    service: string;
    category: string;
    env: string | null;
    host: string | null;
    level: string;
    severity: number;
    message: string;
    error: LoggerError | undefined;
    extra_data: string;
    context: LoggerContext;
    tags: string[];
}

export interface LoggerError {
    [key: string]: JsonValue | undefined;
    name: string;
    message: string;
    stack: string | undefined;
    cause?: JsonValue;
}

export interface LoggerRuntimeContext {
    name: LoggerRuntimeName;
    version: string;
    nodeCompatibilityVersion: string;
}

export interface LoggerLaunchContext {
    entrypoint: string;
    argv: string[];
    execArgv: string[];
    cwd: string;
    flags: {
        verbose: boolean;
        debug: boolean;
    };
}

export interface LoggerProcessContext {
    id: number;
    uptimeSeconds: number;
    hostname: string;
    arch: string;
}

export interface LoggerWorkerContext {
    isWorkerThread: boolean;
    threadId: number;
    data: JsonValue | null;
}

export interface LoggerMemoryContext {
    bunJscGcMaxHeapSize?: string;
    maxOldSpaceSizeMb?: number;
}

export interface LoggerContext {
    argString: string;
    workerJson: string;
    scriptInstanceId: string;
    processId: number;
    uptime: number;
    nodeVersion: string;
    platform: string;
    runtimeName: LoggerRuntimeName;
    runtimeVersion: string;
    uptimeSeconds: number;
    hostname: string;
    arch: string;
    runtime: LoggerRuntimeContext;
    launch: LoggerLaunchContext;
    process: LoggerProcessContext;
    worker: LoggerWorkerContext;
    memory: LoggerMemoryContext;
}

export class Logger {
    verbose = false;
    debug = false;
    private static readonly sensitiveKeyFragments = [
        'token',
        'secret',
        'password',
        'passwd',
        'pwd',
        'apikey',
        'appkey',
        'clientkey',
        'accesskey',
        'privatekey',
        'authorization',
        'auth',
        'cookie',
        'session',
        'jwt',
        'bearer'
    ];
    private readonly scriptInstanceId: string;
    private readonly logDir: string;
    private readonly jobLogDir: string;
    private readonly recentErrors = new Map<string, number>();
    private readonly duplicateSuppressionWindowMs: number;
    private readonly outputSeverity: number = 7;
    private readonly enableDuplicateSuppression: boolean;

    // Add recursion protection and original console methods
    private isLogging = false;
    private readonly originalConsoleError: typeof console.error;
    private readonly originalConsoleLog: typeof console.log;

    private static instance: Logger | null = null;

    private constructor(config?: LoggerConfig) {
        this.verbose = config?.verbose ?? false;
        this.outputSeverity = config?.outputSeverity ?? 7;

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

    private getRuntimeMetadata(): LoggerRuntimeContext {
        const bunGlobal = globalThis as typeof globalThis & {
            Bun?: {
                version?: string;
                main?: string;
            };
        };
        const processVersions = process.versions as NodeJS.ProcessVersions & {
            bun?: string;
        };
        const bunVersion = bunGlobal.Bun?.version ?? processVersions.bun;

        return {
            name: bunVersion ? 'bun' : process.release?.name === 'node' ? 'node' : 'unknown',
            version: bunVersion ?? process.version,
            nodeCompatibilityVersion: process.version
        };
    }

    private isSensitiveKey(key: string): boolean {
        const normalizedKey = key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');

        return Logger.sensitiveKeyFragments.some((fragment) => normalizedKey.includes(fragment));
    }

    private normalizeForJson(value: unknown, seen: WeakSet<object> = new WeakSet<object>(), key = ''): JsonValue | undefined {
        if (key && this.isSensitiveKey(key)) {
            return '[REDACTED]';
        }

        if (value === undefined) {
            return undefined;
        }

        if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return value;
        }

        if (typeof value === 'bigint') {
            return value.toString();
        }

        if (value instanceof Date) {
            return value.toISOString();
        }

        if (value instanceof Error) {
            if (seen.has(value)) {
                return '[Circular]';
            }

            seen.add(value);

            const normalizedError: { [key: string]: JsonValue } = {
                name: value.name,
                message: value.message,
                ...(value.stack ? { stack: value.stack } : {})
            };

            if (value.cause !== undefined) {
                const normalizedCause = this.normalizeForJson(value.cause, seen, 'cause');

                if (normalizedCause !== undefined) {
                    normalizedError.cause = normalizedCause;
                }
            }

            for (const propertyName of Object.getOwnPropertyNames(value)) {
                if (['name', 'message', 'stack', 'cause'].includes(propertyName)) {
                    continue;
                }

                const propertyValue = this.normalizeForJson(Reflect.get(value, propertyName), seen, propertyName);

                if (propertyValue !== undefined) {
                    normalizedError[propertyName] = propertyValue;
                }
            }

            return normalizedError;
        }

        if (Array.isArray(value)) {
            return value.map((item) => this.normalizeForJson(item, seen) ?? null);
        }

        if (typeof value === 'object') {
            if (seen.has(value)) {
                return '[Circular]';
            }

            seen.add(value);

            const normalizedObject: { [key: string]: JsonValue } = {};

            for (const [propertyName, propertyValue] of Object.entries(value)) {
                const normalizedValue = this.normalizeForJson(propertyValue, seen, propertyName);

                if (normalizedValue !== undefined) {
                    normalizedObject[propertyName] = normalizedValue;
                }
            }

            return normalizedObject;
        }

        return String(value);
    }

    private serializeForLog(value: unknown): string {
        const normalizedValue = this.normalizeForJson(value);

        if (normalizedValue === undefined) {
            return '';
        }

        return typeof normalizedValue === 'string' ? normalizedValue : JSON.stringify(normalizedValue, null, 4);
    }

    private redactCliArgs(args: string[]): string[] {
        const redactedArgs: string[] = [];
        let shouldRedactNextValue = false;
        const redactNextArgFlags = new Set(['-e', '--eval', '-p', '--print']);

        for (const arg of args) {
            if (shouldRedactNextValue) {
                redactedArgs.push('[REDACTED]');
                shouldRedactNextValue = false;
                continue;
            }

            const equalsIndex = arg.indexOf('=');
            const prefix = equalsIndex >= 0 ? arg.slice(0, equalsIndex) : arg;
            const key = prefix.replace(/^-+/, '');

            if (redactNextArgFlags.has(arg)) {
                redactedArgs.push(arg);
                shouldRedactNextValue = true;
                continue;
            }

            if (this.isSensitiveKey(key)) {
                if (equalsIndex >= 0) {
                    redactedArgs.push(`${prefix}=[REDACTED]`);
                } else {
                    redactedArgs.push(arg);
                    shouldRedactNextValue = true;
                }

                continue;
            }

            redactedArgs.push(arg);
        }

        return redactedArgs;
    }

    private getEntrypoint(args: string[]): string {
        const bunGlobal = globalThis as typeof globalThis & {
            Bun?: {
                main?: string;
            };
        };

        return bunGlobal.Bun?.main ?? args[0] ?? '';
    }

    private getMaxOldSpaceSizeMb(args: string[]): number | undefined {
        for (let index = 0; index < args.length; index += 1) {
            const currentArg = args[index];

            if (!currentArg) {
                continue;
            }

            if (currentArg.startsWith('--max-old-space-size=')) {
                const parsedValue = Number.parseInt(currentArg.split('=')[1] ?? '', 10);

                if (Number.isFinite(parsedValue) && parsedValue > 0) {
                    return parsedValue;
                }
            }

            if (currentArg === '--max-old-space-size') {
                const parsedValue = Number.parseInt(args[index + 1] ?? '', 10);

                if (Number.isFinite(parsedValue) && parsedValue > 0) {
                    return parsedValue;
                }
            }
        }

        return undefined;
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

        const { level, severity, message, extraData, service, category } = config;
        let { error } = config;

        this.isLogging = true;

        try {
            Error.stackTraceLimit = Infinity;

            const runtime = this.getRuntimeMetadata();
            const redactedArgv = this.redactCliArgs(process.argv.slice(1));
            const redactedExecArgv = this.redactCliArgs(process.execArgv);
            const argString = redactedArgv.join(' ');
            const normalizedWorkerData = workerData === undefined ? null : this.normalizeForJson(workerData) ?? null;
            const workerJson = normalizedWorkerData === null ? '' : JSON.stringify(normalizedWorkerData);
            const hostname = os.hostname();
            const uptimeSeconds = process.uptime();
            const maxOldSpaceSizeMb = this.getMaxOldSpaceSizeMb(process.execArgv);
            const bunJscGcMaxHeapSize = process.env.BUN_JSC_gcMaxHeapSize?.trim();
            const env = process.env.NODE_ENV ?? process.env.BUN_ENV ?? null;
            const tags = Array.from(
                new Set(
                    [
                        `runtime:${runtime.name}`,
                        isMainThread ? 'main-thread' : 'worker-thread',
                        ...(this.verbose ? ['verbose'] : []),
                        ...(this.debug ? ['debug'] : [])
                    ].filter((tag): tag is string => tag.length > 0)
                )
            );

            let extraDataOutput = typeof extraData === 'string' ? extraData : '';
            extraDataOutput = extraData instanceof Error ? extraData.message : extraDataOutput;
            extraDataOutput = extraData instanceof TypeError ? extraData.message : extraDataOutput;

            // Safe JSON serialization for extra data
            if (!extraDataOutput && extraData) {
                try {
                    extraDataOutput = this.serializeForLog(extraData);
                } catch (_err) {
                    extraDataOutput = '[Unable to serialize extra data]';
                }
            }

            // Enhanced error serialization - capture more error context
            let errorDetails: LoggerError | undefined;

            error = (level === 'error' || level === 'warn') && !error ? new Error(message) : error;

            if (error) {
                try {
                    const baseErrorDetails: LoggerError = {
                        name: error.name,
                        message: error.message,
                        stack: error.stack
                    };

                    // Only add cause if it exists
                    if (error.cause) {
                        const normalizedCause = this.normalizeForJson(error.cause);

                        if (normalizedCause !== undefined) {
                            baseErrorDetails.cause = normalizedCause;
                        }
                    }

                    const loggedError = error;

                    errorDetails = {
                        ...baseErrorDetails,
                        // Capture any custom properties on the error object
                        ...Object.getOwnPropertyNames(loggedError).reduce(
                            (acc: Record<string, JsonValue>, key) => {
                                if (!['name', 'message', 'stack'].includes(key)) {
                                    const normalizedValue = this.normalizeForJson(
                                        Reflect.get(loggedError, key),
                                        new WeakSet<object>(),
                                        key
                                    );

                                    if (normalizedValue !== undefined) {
                                        acc[key] = normalizedValue;
                                    }
                                }

                                return acc;
                            },
                            {}
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
            const dateTime = getDate({ format: 'ymdhms' });

            const unix_timestamp = Date.now();

            const logEntry: LoggerRecord = {
                timestamp: dateTime,
                unix_timestamp,
                level,
                severity,
                message: message ?? '',
                env,
                host: hostname,
                error: errorDetails,
                extra_data: extraDataOutput,
                context: {
                    argString,
                    workerJson,
                    scriptInstanceId: this.scriptInstanceId,
                    processId: process.pid,
                    uptime: uptimeSeconds,
                    nodeVersion: runtime.nodeCompatibilityVersion,
                    platform: process.platform,
                    runtimeName: runtime.name,
                    runtimeVersion: runtime.version,
                    uptimeSeconds,
                    hostname,
                    arch: process.arch,
                    runtime,
                    launch: {
                        entrypoint: this.getEntrypoint(redactedArgv),
                        argv: redactedArgv,
                        execArgv: redactedExecArgv,
                        cwd: process.cwd(),
                        flags: {
                            verbose: this.verbose,
                            debug: this.debug
                        }
                    },
                    process: {
                        id: process.pid,
                        uptimeSeconds,
                        hostname,
                        arch: process.arch
                    },
                    worker: {
                        isWorkerThread: !isMainThread,
                        threadId,
                        data: normalizedWorkerData
                    },
                    memory: {
                        ...(bunJscGcMaxHeapSize ? { bunJscGcMaxHeapSize } : {}),
                        ...(maxOldSpaceSizeMb !== undefined ? { maxOldSpaceSizeMb } : {})
                    }
                },
                tags,
                service: service ?? '',
                category: category ?? ''
            };

            // Check for duplicate errors before proceeding
            if (this.isDuplicate(config)) {
                return; // Skip duplicate
            }

            // Better file naming - group by date and level for easier analysis
            const filename = `${this.logDir}files/${dateTime}_${level}_${nanoid(8)}.json`;

            // Record this error to prevent future duplicates
            this.recordError(config);

            // Log to console if verbose is true and it's an error or warn
            if (this.verbose && (level === 'error' || level === 'warn')) {
                this.originalConsoleLog(`[${dateTime}] [${level.toUpperCase()}] ${message || 'No message'}`);

                if (errorDetails) {
                    this.originalConsoleLog('Error Details:', {
                        name: errorDetails.name,
                        message: errorDetails.message,
                        stack: errorDetails.stack
                    });
                }

                if (extraDataOutput && extraDataOutput !== '{}') {
                    this.originalConsoleLog('Extra Data:', extraDataOutput);
                }
            }

            try {
                // Safe JSON serialization for log entry
                const logEntryJson = JSON.stringify(logEntry);
                writeFileSync(filename, logEntryJson);

                if (severity >= this.outputSeverity) {
                    console.log(logEntry);
                }
            } catch (err) {
                // Use original console methods to prevent recursion
                this.originalConsoleLog('Failed to write log file:', err);

                // Try to output a simplified version
                try {
                    const simplifiedEntry = {
                        timestamp: dateTime,
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
                severity: 7,
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
                severity: 7,
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
