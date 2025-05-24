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

    private static instance: Logger | null = null;

    private constructor(config?: LoggerConfig) {
        this.verbose = config?.verbose ?? false;
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

    log(config: LogEntry): void {
        const { level, severity, message, error, extraData, service, category } = config;

        Error.stackTraceLimit = Infinity;

        const argString = process.argv.slice(1).join(' ');
        const workerJson = workerData ? `${JSON.stringify(workerData)}` : '';

        let extraDataOutput = typeof extraData === 'string' ? extraData : '';
        extraDataOutput = extraData instanceof Error ? extraData.message : extraDataOutput;
        extraDataOutput = extraData instanceof TypeError ? extraData.message : extraDataOutput;
        extraDataOutput = !extraDataOutput && extraData ? JSON.stringify(extraData, null, 4) : extraDataOutput;

        // Enhanced error serialization - capture more error context
        const errorDetails = error
            ? {
                  name: error.name,
                  message: error.message,
                  stack: error.stack,
                  cause: error.cause ? JSON.stringify(error.cause) : undefined,
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
              }
            : undefined;

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

        // Better file naming - group by date and level for easier analysis
        const dateStr = timestamp.substring(0, 10); // YYYYMMDD
        const filename = `${this.logDir}files/${dateStr}_${level}_${nanoid(8)}.json`;

        const errorHash = error ? `${error.name}:${error.message}` : message;

        if (errorHash && this.recentErrors.has(errorHash)) {
            return; // Skip duplicate
        }

        if (errorHash) this.recentErrors.set(errorHash, Date.now());

        try {
            // Use faster JSON.stringify for performance
            writeFileSync(filename, JSON.stringify(logEntry));
        } catch (err) {
            console.log('Failed to write log file:', err);
            // Emergency fallback - at least get it to console
            console.log('Log entry:', JSON.stringify(logEntry, null, 2));
        }
    }

    private setupProcessHandlers() {
        this.verbose = !!process.argv.includes('--verbose');
        this.debug = !!process.argv.includes('--debug');

        process.env.TZ = 'America/New_York';
        const originalConsoleError = console.error;

        console.error = (...args: unknown[]) => {
            // Log the error using the Logger's logError method
            const errorMessage = args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ');
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
            originalConsoleError.apply(console, args);
        };

        process.on('uncaughtException', (err, origin) => {
            console.log(err);
            console.log(origin);

            this.log({
                level: 'error',
                severity: 10,
                message: `uncaughtException: ${JSON.stringify(origin)}`,
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

            this.log({
                level: 'error',
                severity: 10,
                message: `unhandledRejection: ${JSON.stringify(reason)}`,
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
