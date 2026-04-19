/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { getDate } from '../date/getDate.js';
import { checkTimezoneIsEst } from '../date/checkTimezoneIsEst.js';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import os from 'os';
import {
    getMeteoricWorkerData,
    getMeteoricWorkerThreadId,
    isBunIpcChildProcessRuntime,
    isBunThreadWorkerRuntime
} from './workerRuntime.js';

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
    executionModel: 'main-thread' | 'worker-thread' | 'ipc-child-process';
    isIpcChildProcess: boolean;
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

export const formatLoggerTimestampForClickHouse = (unixTimestampMs: number): string => {
    const timestampIso = getDate({
        date: unixTimestampMs / 1000,
        format: 'iso',
        timezone: 'Etc/UTC'
    });

    return typeof timestampIso === 'string' ? timestampIso.replace('T', ' ').replace('Z', '') : '';
};

export class Logger {
    private static readonly maxMessageBytes = 32 * 1024;
    private static readonly maxExtraDataBytes = 64 * 1024;
    private static readonly maxErrorBytes = 48 * 1024;
    private static readonly maxErrorFieldBytes = 16 * 1024;
    private static readonly maxErrorStackBytes = 24 * 1024;
    private static readonly maxContextBytes = 24 * 1024;
    private static readonly maxContextFieldBytes = 4 * 1024;
    private static readonly maxWorkerDataBytes = 4 * 1024;
    private static readonly maxWorkerJsonBytes = 4 * 1024;
    private static readonly maxLogRecordBytes = 256 * 1024;

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
    private gracefulExitTimer: ReturnType<typeof setTimeout> | null = null;

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

        this.setupProcessHandlers();
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

    public static peekInstance(): Logger | null {
        return Logger.instance;
    }

    public getLogDir(): string {
        return this.logDir;
    }

    static resetInstanceForTests(): void {
        Logger.instance = null;
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

    private redactStringSecretValue(value: string): string {
        if (!value) return '[REDACTED]';
        if (value.includes('[REDACTED]')) return value;

        const trimmedValue = value.trim();

        if (!trimmedValue) return '[REDACTED]';
        if (trimmedValue.toLowerCase().startsWith('bearer ')) return 'Bearer [REDACTED]';
        if (trimmedValue.length <= 8) return '[REDACTED]';

        return `${trimmedValue.slice(0, 4)}[REDACTED]`;
    }

    private sanitizeStringForLog(value: string): string {
        let sanitizedValue = value;

        sanitizedValue = sanitizedValue.replace(/"([^"\\]+)"(\s*:\s*)"((?:\\.|[^"\\])*)"/g, (match, key, separator, rawValue) => {
            if (!this.isSensitiveKey(key)) return match;
            return `"${key}"${separator}"${this.redactStringSecretValue(rawValue)}"`;
        });

        sanitizedValue = sanitizedValue.replace(/'([^'\\]+)'(\s*:\s*)'((?:\\.|[^'\\])*)'/g, (match, key, separator, rawValue) => {
            if (!this.isSensitiveKey(key)) return match;
            return `'${key}'${separator}'${this.redactStringSecretValue(rawValue)}'`;
        });

        sanitizedValue = sanitizedValue.replace(/\b([A-Za-z0-9_.-]+)(\s*=\s*)"((?:\\.|[^"\\])*)"/g, (match, key, separator, rawValue) => {
            if (!this.isSensitiveKey(key)) return match;
            return `${key}${separator}"${this.redactStringSecretValue(rawValue)}"`;
        });

        sanitizedValue = sanitizedValue.replace(/\b([A-Za-z0-9_.-]+)(\s*=\s*)'((?:\\.|[^'\\])*)'/g, (match, key, separator, rawValue) => {
            if (!this.isSensitiveKey(key)) return match;
            return `${key}${separator}'${this.redactStringSecretValue(rawValue)}'`;
        });

        sanitizedValue = sanitizedValue.replace(/\b([A-Za-z0-9_.-]+)(\s*=\s*)([^\s,}\]]+)/g, (match, key, separator, rawValue) => {
            if (!this.isSensitiveKey(key)) return match;
            return `${key}${separator}${this.redactStringSecretValue(rawValue)}`;
        });

        sanitizedValue = sanitizedValue.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, 'Bearer [REDACTED]');

        return sanitizedValue;
    }

    private sanitizeConsoleArg(arg: unknown): unknown {
        if (typeof arg === 'string') {
            return this.sanitizeStringForLog(arg);
        }

        if (arg instanceof Error) {
            return this.normalizeForJson(arg);
        }

        const normalizedArg = this.normalizeForJson(arg);
        return normalizedArg === undefined ? arg : normalizedArg;
    }

    private sanitizeConsoleArgs(args: unknown[]): unknown[] {
        return args.map((arg) => this.sanitizeConsoleArg(arg));
    }

    private normalizeForJson(value: unknown, seen: WeakSet<object> = new WeakSet<object>(), key = ''): JsonValue | undefined {
        if (key && this.isSensitiveKey(key)) {
            return '[REDACTED]';
        }

        if (value === undefined) {
            return undefined;
        }

        if (value === null || typeof value === 'number' || typeof value === 'boolean') {
            return value;
        }

        if (typeof value === 'string') {
            return this.sanitizeStringForLog(value);
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
                message: this.sanitizeStringForLog(value.message),
                ...(value.stack ? { stack: this.sanitizeStringForLog(value.stack) } : {})
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

        if (typeof value === 'symbol') {
            return value.toString();
        }

        return `[Unsupported value type: ${typeof value}]`;
    }

    private getUtf8ByteLength(value: string): number {
        return Buffer.byteLength(value, 'utf8');
    }

    private truncateStringToMaxBytes(value: string, maxBytes: number, label: string): string {
        const originalBytes = this.getUtf8ByteLength(value);
        if (originalBytes <= maxBytes) return value;

        const suffix = `...[TRUNCATED ${label}; originalBytes=${originalBytes}]`;
        const suffixBytes = this.getUtf8ByteLength(suffix);

        if (suffixBytes >= maxBytes) {
            let low = 0;
            let high = suffix.length;
            let best = '';

            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                const candidate = suffix.slice(0, mid);

                if (this.getUtf8ByteLength(candidate) <= maxBytes) {
                    best = candidate;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }

            return best;
        }

        const targetBytes = maxBytes - suffixBytes;
        let low = 0;
        let high = value.length;
        let best = '';

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const candidate = value.slice(0, mid);

            if (this.getUtf8ByteLength(candidate) <= targetBytes) {
                best = candidate;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return `${best}${suffix}`;
    }

    private boundJsonValue(value: JsonValue | null, maxBytes: number, label: string): JsonValue | null {
        if (value === null) return null;

        const serializedValue = JSON.stringify(value);
        const serializedBytes = this.getUtf8ByteLength(serializedValue);

        if (serializedBytes <= maxBytes) {
            return value;
        }

        return {
            truncated: true,
            label,
            originalBytes: serializedBytes,
            preview: this.truncateStringToMaxBytes(
                serializedValue,
                Math.max(256, Math.min(2048, Math.floor(maxBytes / 2))),
                `${label}.preview`
            )
        };
    }

    private compactErrorDetails(errorDetails: LoggerError | undefined, aggressive = false): LoggerError | undefined {
        if (!errorDetails) return undefined;

        const boundedErrorDetails: LoggerError = {
            name: this.truncateStringToMaxBytes(errorDetails.name, 512, 'error.name'),
            message: this.truncateStringToMaxBytes(errorDetails.message, aggressive ? 1024 : Logger.maxErrorFieldBytes, 'error.message'),
            stack: errorDetails.stack
                ? this.truncateStringToMaxBytes(errorDetails.stack, aggressive ? 2048 : Logger.maxErrorStackBytes, 'error.stack')
                : undefined
        };

        for (const [key, value] of Object.entries(errorDetails)) {
            if (['name', 'message', 'stack'].includes(key) || value === undefined) {
                continue;
            }

            const boundedValue = this.boundJsonValue(value, aggressive ? 512 : Logger.maxErrorFieldBytes, `error.${key}`);
            boundedErrorDetails[key] = boundedValue;
        }

        const serializedBytes = this.getUtf8ByteLength(JSON.stringify(boundedErrorDetails));

        if (serializedBytes <= (aggressive ? 8 * 1024 : Logger.maxErrorBytes)) {
            return boundedErrorDetails;
        }

        return {
            name: boundedErrorDetails.name,
            message: boundedErrorDetails.message,
            stack: boundedErrorDetails.stack,
            truncated: true,
            originalBytes: serializedBytes
        };
    }

    private compactContext(context: LoggerContext, aggressive = false): LoggerContext {
        const boundedContext: LoggerContext = {
            ...context,
            argString: this.truncateStringToMaxBytes(
                context.argString,
                aggressive ? 1024 : Logger.maxContextFieldBytes,
                'context.argString'
            ),
            workerJson: this.truncateStringToMaxBytes(
                context.workerJson,
                aggressive ? 512 : Logger.maxWorkerJsonBytes,
                'context.workerJson'
            ),
            launch: {
                ...context.launch,
                entrypoint: this.truncateStringToMaxBytes(
                    context.launch.entrypoint,
                    aggressive ? 256 : Logger.maxContextFieldBytes,
                    'context.launch.entrypoint'
                ),
                argv: context.launch.argv
                    .slice(0, aggressive ? 10 : 25)
                    .map((arg) => this.truncateStringToMaxBytes(arg, aggressive ? 128 : 512, 'context.launch.argv')),
                execArgv: context.launch.execArgv
                    .slice(0, aggressive ? 10 : 25)
                    .map((arg) => this.truncateStringToMaxBytes(arg, aggressive ? 128 : 512, 'context.launch.execArgv')),
                cwd: this.truncateStringToMaxBytes(context.launch.cwd, aggressive ? 256 : Logger.maxContextFieldBytes, 'context.launch.cwd')
            },
            worker: {
                ...context.worker,
                data: this.boundJsonValue(context.worker.data, aggressive ? 512 : Logger.maxWorkerDataBytes, 'context.worker.data')
            }
        };

        const serializedBytes = this.getUtf8ByteLength(JSON.stringify(boundedContext));

        if (serializedBytes <= (aggressive ? 6 * 1024 : Logger.maxContextBytes)) {
            return boundedContext;
        }

        return {
            ...boundedContext,
            workerJson: '',
            launch: {
                ...boundedContext.launch,
                argv: boundedContext.launch.argv.slice(0, aggressive ? 3 : 5),
                execArgv: boundedContext.launch.execArgv.slice(0, aggressive ? 3 : 5)
            },
            worker: {
                ...boundedContext.worker,
                data: boundedContext.worker.data === null ? null : '[TRUNCATED]'
            }
        };
    }

    private ensureLogEntryFits(logEntry: LoggerRecord): LoggerRecord {
        if (this.getUtf8ByteLength(JSON.stringify(logEntry)) <= Logger.maxLogRecordBytes) {
            return logEntry;
        }

        const compactEntry: LoggerRecord = {
            ...logEntry,
            message: this.truncateStringToMaxBytes(logEntry.message, 8 * 1024, 'message'),
            extra_data: logEntry.extra_data
                ? this.truncateStringToMaxBytes(logEntry.extra_data, 8 * 1024, 'extra_data')
                : logEntry.extra_data,
            error: this.compactErrorDetails(logEntry.error, true),
            context: this.compactContext(logEntry.context, true),
            tags: logEntry.tags.slice(0, 10)
        };

        if (this.getUtf8ByteLength(JSON.stringify(compactEntry)) <= Logger.maxLogRecordBytes) {
            return compactEntry;
        }

        const fallbackEntry: LoggerRecord = {
            ...compactEntry,
            message: this.truncateStringToMaxBytes(compactEntry.message, 2048, 'message'),
            extra_data: '',
            error: compactEntry.error
                ? {
                      name: compactEntry.error.name,
                      message: this.truncateStringToMaxBytes(compactEntry.error.message, 512, 'error.message'),
                      stack: compactEntry.error.stack
                          ? this.truncateStringToMaxBytes(compactEntry.error.stack, 512, 'error.stack')
                          : undefined,
                      truncated: true
                  }
                : undefined,
            context: {
                ...compactEntry.context,
                argString: this.truncateStringToMaxBytes(compactEntry.context.argString, 256, 'context.argString'),
                workerJson: '',
                launch: {
                    ...compactEntry.context.launch,
                    entrypoint: this.truncateStringToMaxBytes(compactEntry.context.launch.entrypoint, 128, 'context.launch.entrypoint'),
                    argv: [],
                    execArgv: [],
                    cwd: this.truncateStringToMaxBytes(compactEntry.context.launch.cwd, 128, 'context.launch.cwd')
                },
                worker: {
                    ...compactEntry.context.worker,
                    data: null
                }
            },
            tags: compactEntry.tags.slice(0, 5)
        };

        if (this.getUtf8ByteLength(JSON.stringify(fallbackEntry)) <= Logger.maxLogRecordBytes) {
            return fallbackEntry;
        }

        return {
            ...fallbackEntry,
            message: '[TRUNCATED] Log entry exceeded max record size after compaction',
            extra_data: '',
            error: fallbackEntry.error
                ? {
                      name: fallbackEntry.error.name,
                      message: fallbackEntry.error.message,
                      stack: fallbackEntry.error.stack,
                      truncated: true
                  }
                : undefined,
            context: {
                ...fallbackEntry.context,
                argString: '',
                workerJson: '',
                launch: {
                    ...fallbackEntry.context.launch,
                    entrypoint: '',
                    argv: [],
                    execArgv: [],
                    cwd: ''
                }
            },
            tags: []
        };
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
        const topStackFrame = error?.stack?.split('\n')[1]?.trim() ?? '';

        // Include more context in the hash to reduce false positives
        const parts = [level, service || '', category || '', error ? `${error.name}:${error.message}` : message || '', topStackFrame];

        return parts.join('|');
    }

    /**
     * Check if this error should be suppressed as a duplicate
     */
    private isDuplicate(config: LogEntry): boolean {
        if (!this.enableDuplicateSuppression) return false;
        if (config.severity >= 9) return false;

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
        if (config.severity >= 9) return;

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
            const isWorkerThread = isBunThreadWorkerRuntime();
            const isIpcChildProcess = isBunIpcChildProcessRuntime();

            const executionModel: LoggerWorkerContext['executionModel'] = isWorkerThread
                ? 'worker-thread'
                : isIpcChildProcess
                  ? 'ipc-child-process'
                  : 'main-thread';

            const workerData = getMeteoricWorkerData();
            const normalizedWorkerData = workerData === undefined ? null : (this.normalizeForJson(workerData) ?? null);
            const workerThreadId = isWorkerThread ? getMeteoricWorkerThreadId() : 0;
            const hostname = os.hostname();
            const uptimeSeconds = process.uptime();
            const maxOldSpaceSizeMb = this.getMaxOldSpaceSizeMb(process.execArgv);
            const bunJscGcMaxHeapSize = process.env.BUN_JSC_gcMaxHeapSize?.trim();
            const env = process.env.NODE_ENV ?? process.env.BUN_ENV ?? null;

            const tags = Array.from(
                new Set(
                    [
                        `runtime:${runtime.name}`,
                        executionModel,
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

            const boundedMessage = this.truncateStringToMaxBytes(
                this.sanitizeStringForLog(message ?? ''),
                Logger.maxMessageBytes,
                'message'
            );

            const boundedExtraDataOutput = this.truncateStringToMaxBytes(
                this.sanitizeStringForLog(extraDataOutput),
                Logger.maxExtraDataBytes,
                'extra_data'
            );

            const boundedWorkerData =
                normalizedWorkerData === null ? null : this.boundJsonValue(normalizedWorkerData, Logger.maxWorkerDataBytes, 'worker.data');

            const workerJson =
                boundedWorkerData === null
                    ? ''
                    : this.truncateStringToMaxBytes(JSON.stringify(boundedWorkerData), Logger.maxWorkerJsonBytes, 'workerJson');

            error = (level === 'error' || level === 'warn') && !error ? new Error(boundedMessage) : error;

            if (error) {
                try {
                    const baseErrorDetails: LoggerError = {
                        name: error.name,
                        message: this.sanitizeStringForLog(error.message),
                        stack: error.stack ? this.sanitizeStringForLog(error.stack) : undefined
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
                        ...Object.getOwnPropertyNames(loggedError).reduce((acc: Record<string, JsonValue>, key) => {
                            if (!['name', 'message', 'stack'].includes(key)) {
                                const normalizedValue = this.normalizeForJson(Reflect.get(loggedError, key), new WeakSet<object>(), key);

                                if (normalizedValue !== undefined) {
                                    acc[key] = normalizedValue;
                                }
                            }

                            return acc;
                        }, {})
                    };
                } catch (_err) {
                    // Fallback if error serialization fails
                    errorDetails = {
                        name: error.name || 'Unknown',
                        message: this.sanitizeStringForLog(error.message || 'Unknown error'),
                        stack: this.sanitizeStringForLog(error.stack || 'No stack trace available')
                    };
                }
            }

            // Get current timestamp for consistent timing
            const unix_timestamp = Date.now();
            const timestamp = formatLoggerTimestampForClickHouse(unix_timestamp);
            const fileDateTime = getDate({ format: 'ymdhms' });

            const logEntry: LoggerRecord = {
                timestamp,
                unix_timestamp,
                level,
                severity,
                message: boundedMessage,
                env,
                host: hostname,
                error: this.compactErrorDetails(errorDetails),
                extra_data: boundedExtraDataOutput,
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
                        executionModel,
                        isIpcChildProcess,
                        isWorkerThread,
                        threadId: workerThreadId,
                        data: boundedWorkerData
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

            const boundedLogEntry = this.ensureLogEntryFits(logEntry);

            // Check for duplicate errors before proceeding
            if (this.isDuplicate(config)) {
                return; // Skip duplicate
            }

            // Better file naming - group by date and level for easier analysis
            const filename = `${this.logDir}files/${fileDateTime}_${level}_${nanoid(8)}.json`;

            // Record this error to prevent future duplicates
            this.recordError(config);

            // Log to console if verbose is true and it's an error or warn
            if (this.verbose && (level === 'error' || level === 'warn')) {
                this.originalConsoleLog(`[${timestamp}] [${level.toUpperCase()}] ${boundedLogEntry.message || 'No message'}`);

                if (boundedLogEntry.error) {
                    this.originalConsoleLog('Error Details:', {
                        name: boundedLogEntry.error.name,
                        message: boundedLogEntry.error.message,
                        stack: boundedLogEntry.error.stack
                    });
                }

                if (boundedLogEntry.extra_data && boundedLogEntry.extra_data !== '{}') {
                    this.originalConsoleLog('Extra Data:', boundedLogEntry.extra_data);
                }
            }

            try {
                // Safe JSON serialization for log entry
                const logEntryJson = JSON.stringify(boundedLogEntry);
                writeFileSync(filename, logEntryJson);

                if (severity >= this.outputSeverity) {
                    this.originalConsoleLog(boundedLogEntry);
                }
            } catch (err) {
                // Use original console methods to prevent recursion
                this.originalConsoleLog(...this.sanitizeConsoleArgs(['Failed to write log file:', err]));

                // Try to output a simplified version
                try {
                    const simplifiedEntry = {
                        timestamp,
                        level,
                        message: message ?? '',
                        error: error ? { name: error.name, message: error.message } : undefined
                    };

                    this.originalConsoleLog('Simplified log entry:', this.sanitizeStringForLog(JSON.stringify(simplifiedEntry, null, 2)));
                } catch (_fallbackErr) {
                    this.originalConsoleLog(...this.sanitizeConsoleArgs(['Log entry (raw):', level, message]));
                }
            }
        } finally {
            this.isLogging = false;
        }
    }

    private getConsoleErrorMessage(args: unknown[]): string {
        return args
            .map((arg) => {
                if (typeof arg === 'string') return this.sanitizeStringForLog(arg);
                if (arg instanceof Error) return this.sanitizeStringForLog(arg.stack || arg.message);

                try {
                    return this.serializeForLog(arg);
                } catch {
                    return '[Unable to serialize argument]';
                }
            })
            .join(' ');
    }

    private getPrimaryConsoleError(args: unknown[]): Error | undefined {
        const foundError = args.find((arg): arg is Error => arg instanceof Error);

        return foundError ?? undefined;
    }

    private logGracefulSignal(signal: 'SIGINT' | 'SIGHUP' | 'SIGTERM') {
        this.log({
            level: 'warn',
            severity: 3,
            message: `${signal} received`,
            error: new Error(`${signal} received`),
            service: 'ProcessLifecycle',
            category: 'graceful-shutdown'
        });
    }

    private scheduleDefaultGracefulExit(signal: 'SIGINT' | 'SIGHUP' | 'SIGTERM') {
        if (this.gracefulExitTimer) return;

        if (process.listenerCount(signal) > 1) {
            process.exitCode = 0;
            return;
        }

        process.exitCode = 0;

        this.gracefulExitTimer = setTimeout(() => {
            process.exit(0);
        }, 50);

        this.gracefulExitTimer.unref?.();
    }

    private setupProcessHandlers() {
        this.verbose = !!process.argv.includes('--verbose');
        this.debug = !!process.argv.includes('--debug');

        process.env.TZ = 'America/New_York';

        console.error = (...args: unknown[]) => {
            // Prevent recursion by checking if we're already logging
            if (this.isLogging) {
                this.originalConsoleError('Logger: Recursive console.error call detected');
                this.originalConsoleError(...this.sanitizeConsoleArgs(args));
                return;
            }

            let errorMessage = '';

            try {
                errorMessage = this.getConsoleErrorMessage(args);
            } catch {
                errorMessage = 'Error processing console.error arguments';
            }

            if (errorMessage.includes('punycode')) return;

            const primaryError = this.getPrimaryConsoleError(args);

            this.log({
                level: 'error',
                severity: 7,
                message: errorMessage,
                ...(primaryError ? { error: primaryError } : { error: new Error(errorMessage) })
            });

            // Call the original console.error to maintain normal behavior
            this.originalConsoleError.apply(console, this.sanitizeConsoleArgs(args));
        };

        process.once('uncaughtException', (err, origin) => {
            // Use original console methods to prevent recursion in critical scenarios
            this.originalConsoleLog(...this.sanitizeConsoleArgs([err]));
            this.originalConsoleLog(...this.sanitizeConsoleArgs([origin]));

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

        process.once('unhandledRejection', (reason) => {
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

        for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
            process.once(signal, () => {
                this.logGracefulSignal(signal);
                this.scheduleDefaultGracefulExit(signal);
            });
        }
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
