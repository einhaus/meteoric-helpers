import { getDate } from '../date/getDate.js';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { workerData } from 'worker_threads';
import path from 'path';
import { generateRandomString } from '../string/generateRandomString.js';
import { checkTimezoneIsEst } from '../index.js';

export interface LoggerConfig {
    logDir: string;
    jobLogDir?: string;
    verbose?: boolean;
    debug?: boolean;
}

export class Logger {
    verbose = false;
    debug = false;
    private readonly startTime: number;
    private readonly scriptInstanceId: string;
    private readonly logDir: string;
    private readonly jobLogDir: string;

    private static instance: Logger | null = null;

    private constructor(config?: LoggerConfig) {
        this.startTime = Date.now();
        this.verbose = config?.verbose ?? false;
        this.setupProcessHandlers();
        this.debug = config?.debug ?? false;
        this.scriptInstanceId = generateRandomString(15);
        Error.stackTraceLimit = 25;
        checkTimezoneIsEst();

        // Set log directories from config or use defaults
        this.logDir = config?.logDir ? `${path.resolve(config.logDir)}/` : `${path.resolve('./logs/')}/`;
        this.jobLogDir = config?.jobLogDir ? `${path.resolve(config.jobLogDir)}/` : `${this.logDir}jobLogs/`;

        // Ensure log directories exist
        if (!existsSync(this.logDir)) {
            mkdirSync(this.logDir, { recursive: true });
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
     * Reset the singleton instance (primarily for testing)
     */
    public static resetInstance(): void {
        Logger.instance = null;
    }

    logError(error: Error, extraData?: unknown): void {
        let extraDataOutput = typeof extraData === 'string' ? extraData : '';
        extraDataOutput = extraData instanceof Error ? extraData.message : extraDataOutput;
        extraDataOutput = extraData instanceof TypeError ? extraData.message : extraDataOutput;
        extraDataOutput = !extraDataOutput && extraData ? JSON.stringify(extraData, null, 4) : extraDataOutput;

        if (error.stack?.includes('ExperimentalWarning')) return;

        const randomAppend = generateRandomString(5);

        const fileName = `errorReport_${getDate({ format: 'ymdhms' })}_${randomAppend}.txt`;

        const argString = process.argv.slice(1).join(' ');

        const errorOutput = `${argString}\n${error.stack ?? ''}\nError Timestamp: ${getDate({
            format: 'ymdhms'
        })}\nExtra data: ${extraDataOutput}`;

        console.log('We logged an error: ', errorOutput);

        writeFileSync(this.logDir + fileName, errorOutput);
    }

    logDbError(error: Error): void {
        console.log('We logged a DB error!');
        const fileName = `errorReport_db_${getDate({ format: 'ymdhms' })}.txt`;

        const argString = process.argv.slice(1).join(' ');

        writeFileSync(
            this.logDir + fileName,
            `${argString}\nError Stack: ${error.stack ?? ''}\nError Timestamp: ${getDate({ format: 'ymdhms' })}\n${JSON.stringify(
                error,
                null,
                4
            )}`
        );
    }

    appendTextToLog(logFile: string, text: string): void {
        appendFileSync(`${this.logDir + logFile}.log`, `${text}\n`);
    }

    logJob(cronFile: string, event: 'start' | 'end', appendText = ''): void {
        if (!existsSync(this.jobLogDir)) mkdirSync(this.jobLogDir, { recursive: true });

        appendFileSync(
            `${this.jobLogDir + cronFile}.log`,
            `${event}: ${getDate({ format: 'ymdhms' })} ${this.scriptInstanceId}${appendText}\n`
        );
    }

    private setupProcessHandlers() {
        this.verbose = !!process.argv.includes('--verbose');
        this.debug = !!process.argv.includes('--debug');

        process.env.TZ = 'America/New_York';
        const argString = process.argv.slice(1).join(' ');
        const originalConsoleError = console.error;

        console.error = (...args: unknown[]) => {
            // Log the error using the Logger's logError method
            const errorMessage = args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ');

            // Create an Error object to capture stack trace
            const error = new Error(errorMessage);
            // TODO - at some point we can remove this
            if (!errorMessage.includes('punycode')) this.logError(error, 'console.error called');

            // Call the original console.error to maintain normal behavior
            originalConsoleError.apply(console, args);
        };

        process.on('uncaughtException', (err, origin) => {
            console.log(err);
            console.log(origin);
            const workerJson = workerData ? `\n${JSON.stringify(workerData)}` : '';
            this.logError(err, `uncaughtException: ${JSON.stringify(origin)} ${argString}${workerJson}`);
            process.exit(1);
        });

        process.on('SIGTERM', () => {
            this.logError(new Error('SIGTERM received'), 'SIGTERM');
            process.exit(1);
        });

        process.on('unhandledRejection', (reason) => {
            const workerJson = workerData ? `\n${JSON.stringify(workerData)}` : '';
            const errorMessage = reason instanceof Error ? reason.stack : reason;
            const error = new Error(`Unhandled Rejection at: Promise ${errorMessage as string}${workerJson}`);
            this.logError(error, argString);
            process.exit(1);
        });

        process.on('warning', (warning) => {
            // TODO - at some point we can remove this
            if (warning.message.includes('punycode')) return;
            this.logError(warning, 'warning');
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

    /**
     * Get the configured log directory
     */
    getLogDir(): string {
        return this.logDir;
    }

    /**
     * Get the configured job log directory
     */
    getJobLogDir(): string {
        return this.jobLogDir;
    }

    getSecondsSinceStartTime(): number {
        return (Date.now() - this.startTime) / 1000;
    }
}
