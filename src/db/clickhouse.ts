import { createClient, type ClickHouseClient } from '@clickhouse/client';

import { msg } from '../misc/msg.js';
import type { WhereCondition, DBConfig, SelectReturn, SelectConfigClickhouse } from './dbUtilityTypes.js';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

// Default values that will be used if not specified in the config
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_RETRY_DELAY_MS = 10000;
const DEFAULT_REQUEST_TIMEOUT_MS = 400000; // 400 seconds for long queries
const DEFAULT_MAX_EXECUTION_TIME_SEC = 360; // 360 seconds (6 minutes) server-side
const DEFAULT_SEND_PROGRESS_HEADERS = true; // Keep connection alive
const DEFAULT_PROGRESS_HEADER_INTERVAL_MS = 20000; // Send progress every 20 seconds

/**
 * ClickHouse DB Helper using registry pattern
 */
export class DBClickhouse {
    private static readonly instances: Map<string, DBClickhouse> = new Map();
    private static readonly defaultKey = 'default';
    private client?: ClickHouseClient;
    private config: DBConfig;
    private readonly logFolder: string;
    private readonly maxRetries: number;
    private readonly retryDelayMs: number;
    private readonly requestTimeout: number;
    private readonly maxExecutionTime: number;
    private readonly sendProgressHeaders: boolean;
    private readonly progressHeaderInterval: number;

    /**
     * Private constructor
     * @param config Database configuration
     */
    private constructor(config: DBConfig) {
        this.config = config;
        this.logFolder = config.logFolder;
        this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
        this.requestTimeout = config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT_MS;
        this.maxExecutionTime = config.maxExecutionTime ?? DEFAULT_MAX_EXECUTION_TIME_SEC;
        this.sendProgressHeaders = config.sendProgressHeaders ?? DEFAULT_SEND_PROGRESS_HEADERS;
        this.progressHeaderInterval = config.progressHeaderInterval ?? DEFAULT_PROGRESS_HEADER_INTERVAL_MS;

        // Create log directory if it doesn't exist and a log path is provided
        if (this.logFolder) {
            try {
                const logDir = path.dirname(this.logFolder);

                if (!existsSync(logDir)) {
                    mkdirSync(logDir, { recursive: true });
                }
            } catch (error) {
                console.error('Failed to create log directory:', error);
            }
        }
    }

    /**
     * Get an instance of DBClickhouse
     * @param config Database configuration
     * @param key Optional key to identify the instance (defaults to 'default')
     * @returns DBClickhouse instance
     */
    public static getInstance(config?: DBConfig, key?: string) {
        const instanceKey = key || DBClickhouse.defaultKey;
        const instance = DBClickhouse.instances.get(instanceKey);

        if (!instance) {
            if (!config) {
                throw new Error(`DBClickhouse instance with key "${instanceKey}" not initialized. Please provide configuration.`);
            }

            const newInstance = new DBClickhouse(config);
            DBClickhouse.instances.set(instanceKey, newInstance);
            return newInstance;
        } else if (config) {
            // If config is provided and instance exists, update the config
            instance.config = config;
            // Close existing connection to apply new config on next getClient call
            void instance.closeConnection();
        }

        return instance;
    }

    /**
     * Get all registered instance keys
     * @returns Array of instance keys
     */
    public static getInstanceKeys(): string[] {
        return Array.from(DBClickhouse.instances.keys());
    }

    /**
     * Remove an instance from the registry
     * @param key The key of the instance to remove
     * @returns true if the instance was found and removed, false otherwise
     */
    public static async removeInstance(key: string): Promise<boolean> {
        const instance = DBClickhouse.instances.get(key);

        if (instance) {
            await instance.closeConnection();
            return DBClickhouse.instances.delete(key);
        }

        return false;
    }

    /**
     * Get or create the database connection client
     * @returns ClickHouseClient instance
     */
    getClient() {
        if (this.client) return this.client;

        // Build ClickHouse settings object
        const clickhouseSettings: Record<string, string | number> = {
            max_execution_time: this.maxExecutionTime
        };

        // Add progress headers if enabled
        if (this.sendProgressHeaders) {
            clickhouseSettings.send_progress_in_http_headers = 1;
            clickhouseSettings.http_headers_progress_interval_ms = this.progressHeaderInterval.toString();
        }

        // Log timeout configuration for debugging
        console.log(
            `[ClickHouse] Initializing client with timeouts: ` +
                `request_timeout=${this.requestTimeout}ms (${Math.round(this.requestTimeout / 1000)}s), ` +
                `max_execution_time=${this.maxExecutionTime}s`
        );

        this.client = createClient({
            url: this.config.host,
            password: this.config.password,
            database: this.config.db,
            request_timeout: this.requestTimeout,
            clickhouse_settings: clickhouseSettings
        });

        return this.client;
    }

    /**
     * Close the database connection
     */
    async closeConnection() {
        if (this.client) {
            await this.client.close();
            // @ts-expect-error: We're intentionally setting this to undefined
            this.client = undefined;
        }
    }

    /**
     * Helper method to get the pool or throw an error if it's not available
     */
    private getOrThrowClient(): ClickHouseClient {
        const client = this.getClient();

        if (!client) {
            throw new Error('ClickHouse client is not available');
        }

        return client;
    }

    /**
     * Handle database errors
     * @param error The error to handle
     * @param query The query that caused the error
     * @param params The parameters that were used with the query
     */
    private handleError(error: unknown, query?: string, params?: unknown): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const timestamp = new Date().toISOString();

        const logMessage = `ERROR: ${errorMessage}\nQuery: ${query ?? 'N/A'}\nParams: ${params ? JSON.stringify(params) : 'N/A'} \nTimestamp: ${timestamp}\n\n`;

        if (this.logFolder) {
            try {
                writeFileSync(`${this.logFolder}/clickhouse-error.log`, logMessage, { flag: 'a' });
            } catch (writeError) {
                console.error('Failed to write to log file:', writeError);
            }
        }

        console.error(logMessage);
    }

    /**
     * Shared WHERE clause builder.
     * Note: since ClickHouse does not support parameter placeholders the same way,
     * we “inline” values (after a very simplistic escaping).
     */
    private buildWhereClause<T>(conditions: WhereCondition<T>[], joinOperator: 'AND' | 'OR'): { clause: string } {
        const parts: string[] = [];

        for (const condition of conditions) {
            if ('group' in condition) {
                const operator = condition.operator ?? 'AND';
                const { clause } = this.buildWhereClause(condition.group, operator);
                parts.push(`(${clause})`);
            } else if (condition.value === null) {
                let op = condition.operator ?? '=';
                if (op === '=') op = 'IS';
                else if (op === '!=' || op === '<>') op = 'IS NOT';
                parts.push(`\`${String(condition.column)}\` ${op} NULL`);
            } else {
                const operator = condition.operator ?? '=';
                const upperOperator = operator.toUpperCase();
                const { value } = condition;

                if (Array.isArray(value) && !(upperOperator === 'IN' || upperOperator === 'BETWEEN' || upperOperator === 'NOT BETWEEN')) {
                    throw new Error(`Operator ${operator} does not support array values.`);
                }

                if (upperOperator === 'BETWEEN' || upperOperator === 'NOT BETWEEN') {
                    if (!Array.isArray(value) || value.length !== 2) {
                        throw new Error(`Operator ${operator} requires an array of exactly two values.`);
                    }

                    parts.push(`\`${String(condition.column)}\` ${upperOperator} ${this.escape(value[0])} AND ${this.escape(value[1])}`);
                } else if (upperOperator === 'IN' && Array.isArray(value)) {
                    const inList = value.map((v) => this.escape(v)).join(', ');
                    parts.push(`\`${String(condition.column)}\` IN (${inList})`);
                } else {
                    parts.push(`\`${String(condition.column)}\` ${operator} ${this.escape(value)}`);
                }
            }
        }

        return { clause: parts.join(` ${joinOperator} `) };
    }

    /**
     * Very basic escaping function.
     * (In production you’d want to use a well‐tested escaping library.)
     */
    private escape(value: unknown): string {
        if (value === null || value === undefined) return 'NULL';
        if (typeof value === 'number') return value.toString();
        if (typeof value === 'boolean') return value ? '1' : '0';
        if (value instanceof Date) return `'${value.toISOString()}'`;

        if (typeof value === 'object') {
            const json = JSON.stringify(value);
            // If JSON.stringify fails or returns undefined, fallback to a safe value.
            return json !== undefined ? `'${json.replace(/'/g, "''")}'` : `'[object Object]'`;
        }

        if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
        return `'${String(value).replace(/'/g, "''")}'`;
    }

    /**
     * Build a SELECT query string from the config.
     */
    private buildSelectQuery<T extends object, C extends (keyof T)[] | undefined>(config: SelectConfigClickhouse<T, C>): string {
        // Determine plain columns part.
        let plainColumnsPart: string;

        if (config.columns === undefined) {
            // If no explicit columns are provided, use '*' by default,
            // unless the caller explicitly set selectAllColumns to false.
            plainColumnsPart = config.selectAllColumns ? '*' : '';
        } else {
            // If an array is provided, even if empty, respect that.
            plainColumnsPart = config.columns.length > 0 ? config.columns.map((col) => `\`${String(col)}\``).join(', ') : '';
        }

        // Build computed (wrapped) columns part.
        let wrappersPart: string | null = null;

        if (config.computedColumns && config.computedColumns.length > 0) {
            wrappersPart = config.computedColumns
                .map((wrapperObj) => {
                    const colName = `\`${String(wrapperObj.column)}\``;
                    const alias = wrapperObj.alias ? ` AS \`${wrapperObj.alias}\`` : ``;
                    return wrapperObj.wrapper === 'DISTINCT' ? `DISTINCT ${colName}${alias}` : `${wrapperObj.wrapper}(${colName})${alias}`;
                })
                .join(', ');
        }

        // Combine plain and computed columns.
        let columnsPart: string;

        if (plainColumnsPart && wrappersPart) {
            columnsPart = `${plainColumnsPart}, ${wrappersPart}`;
        } else if (plainColumnsPart) {
            columnsPart = plainColumnsPart;
        } else if (wrappersPart) {
            columnsPart = wrappersPart;
        } else {
            // Fallback: if nothing is provided, default to '*'
            // (you might also choose to throw an error)
            columnsPart = '*';
        }

        // Append any raw columns.
        if (config.rawColumns && config.rawColumns.length > 0) {
            columnsPart =
                columnsPart === '*' || columnsPart === ''
                    ? config.rawColumns.join(', ')
                    : `${columnsPart}, ${config.rawColumns.join(', ')}`;
        }

        // Build the rest of the query.
        let queryString = `SELECT ${columnsPart} FROM \`${config.table}\``;

        const conditions: WhereCondition<T>[] = config.where ? (Array.isArray(config.where) ? config.where : [config.where]) : [];

        if (conditions.length > 0) {
            const { clause } = this.buildWhereClause(conditions, config.whereOperator ?? 'AND');
            queryString += ` WHERE ${clause}`;
        }

        if (config.groupBy) {
            const groupByArray = Array.isArray(config.groupBy) ? config.groupBy : [config.groupBy];

            if (groupByArray.length > 0) {
                const groupByPart = groupByArray.map((col) => `\`${String(col)}\``).join(', ');
                queryString += ` GROUP BY ${groupByPart}`;
            }
        }

        if (config.orderBy) {
            const orderByArray = Array.isArray(config.orderBy) ? config.orderBy : [config.orderBy];

            if (orderByArray.length > 0) {
                const orderByPart = orderByArray.map((ob) => `\`${String(ob.column)}\` ${ob.direction ?? 'ASC'}`).join(', ');
                queryString += ` ORDER BY ${orderByPart}`;
            }
        }

        if (typeof config.limit === 'number') {
            queryString += ` LIMIT ${config.limit}`;

            if (typeof config.offset === 'number') {
                queryString += ` OFFSET ${config.offset}`;
            }
        }

        return queryString;
    }

    async select<T extends object, C extends (keyof T)[] | undefined = undefined>(
        config: SelectConfigClickhouse<T, C>
    ): Promise<SelectReturn<T, C>> {
        const query = this.buildSelectQuery(config);
        const client = this.getOrThrowClient();
        const results: T[] = [];
        let retryAttempts = 0;

        while (retryAttempts <= this.maxRetries) {
            try {
                if (config.verbose) msg(query);
                const resultSet = await client.query({ query, format: 'JSONEachRow' });

                for await (const rows of resultSet.stream()) {
                    rows.forEach((row: { json: () => T }) => {
                        results.push(row.json());
                    });
                }

                return results as SelectReturn<T, C>;
            } catch (error) {
                this.handleError(error, query);

                if (retryAttempts >= this.maxRetries) {
                    // We've exhausted our retries, return empty result
                    return [] as unknown as SelectReturn<T, C>;
                }

                // Wait before retrying
                await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
                retryAttempts++;
            }
        }

        return [] as unknown as SelectReturn<T, C>;
    }

    async selectOne<T extends object, C extends (keyof T)[] | undefined = undefined>(
        config: SelectConfigClickhouse<T, C>
    ): Promise<SelectReturn<T, C>[0] | undefined> {
        if (typeof config.limit !== 'number') {
            config.limit = 1;
        }

        const results = await this.select<T, C>(config);
        return results[0];
    }

    async insert<T extends object>(config: { table: string; params: T; verbose?: boolean }): Promise<boolean> {
        const columns = Object.keys(config.params);
        const columnList = columns.map((col) => `\`${col}\``).join(', ');
        const valuesList = columns.map((col) => this.escape((config.params as any)[col])).join(', ');
        const query = `INSERT INTO \`${config.table}\` (${columnList}) VALUES (${valuesList})`;
        const client = this.getOrThrowClient();
        let retryAttempts = 0;

        while (retryAttempts <= this.maxRetries) {
            try {
                if (config.verbose) msg(query);
                await client.exec({ query });
                return true;
            } catch (error) {
                this.handleError(error, query, config.params);

                if (retryAttempts >= this.maxRetries) {
                    return false;
                }

                // Wait before retrying
                await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
                retryAttempts++;
            }
        }

        return false;
    }

    async update<T extends object>(config: {
        table: string;
        params: Partial<T>;
        where?: WhereCondition<T>[] | WhereCondition<T>;
        whereOperator?: 'AND' | 'OR';
        verbose?: boolean;
    }): Promise<boolean> {
        const updateColumns = Object.keys(config.params);
        if (updateColumns.length === 0) return false;

        const setClause = updateColumns.map((col) => `\`${col}\` = ${this.escape((config.params as any)[col])}`).join(', ');

        let query = `ALTER TABLE \`${config.table}\` UPDATE ${setClause}`;

        if (config.where) {
            const conditions = Array.isArray(config.where) ? config.where : [config.where];
            const { clause } = this.buildWhereClause(conditions, config.whereOperator ?? 'AND');
            query += ` WHERE ${clause}`;
        }

        const client = this.getOrThrowClient();
        let retryAttempts = 0;

        while (retryAttempts <= this.maxRetries) {
            try {
                if (config.verbose) msg(query);
                await client.exec({ query });
                return true;
            } catch (error) {
                this.handleError(error, query, config.params);

                if (retryAttempts >= this.maxRetries) {
                    return false;
                }

                // Wait before retrying
                await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
                retryAttempts++;
            }
        }

        return false;
    }

    async delete<T extends object>(config: {
        table: string;
        where?: WhereCondition<T>[] | WhereCondition<T>;
        whereOperator?: 'AND' | 'OR';
        verbose?: boolean;
    }): Promise<boolean> {
        let query = `ALTER TABLE \`${config.table}\` DELETE`;

        if (config.where) {
            const conditions = Array.isArray(config.where) ? config.where : [config.where];
            const { clause } = this.buildWhereClause(conditions, config.whereOperator ?? 'AND');
            query += ` WHERE ${clause}`;
        }

        const client = this.getOrThrowClient();
        let retryAttempts = 0;

        while (retryAttempts <= this.maxRetries) {
            try {
                if (config.verbose) msg(query);
                await client.exec({ query });
                return true;
            } catch (error) {
                this.handleError(error, query);

                if (retryAttempts >= this.maxRetries) {
                    return false;
                }

                // Wait before retrying
                await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
                retryAttempts++;
            }
        }

        return false;
    }

    /**
     * Execute a raw SQL query and return results
     * @param query Raw SQL query string
     * @param verbose Whether to log the query
     * @returns Array of results
     */
    async doQuery<T = Record<string, unknown>>(query: string, verbose?: boolean): Promise<T[]> {
        const client = this.getOrThrowClient();
        const results: T[] = [];
        let retryAttempts = 0;

        while (retryAttempts <= this.maxRetries) {
            try {
                if (verbose) msg(query);
                const resultSet = await client.query({ query, format: 'JSONEachRow' });

                for await (const rows of resultSet.stream()) {
                    rows.forEach((row: { json: () => T }) => {
                        results.push(row.json());
                    });
                }

                return results;
            } catch (error) {
                this.handleError(error, query);

                if (retryAttempts >= this.maxRetries) {
                    return [];
                }

                // Wait before retrying
                await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
                retryAttempts++;
            }
        }

        return [];
    }
}
