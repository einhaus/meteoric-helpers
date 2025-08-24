/* eslint-disable @typescript-eslint/naming-convention */
import { Pool, type PoolClient, type QueryResult } from 'pg';
import type {
    DBConfig,
    DbParameters,
    DbParametersWithDate,
    Insertable,
    SelectConfig,
    SelectConfigPg,
    SelectReturn,
    WhereCondition
} from './dbUtilityTypes.js';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { sleep } from '../misc/sleep.js';
import { getDate } from '../date/getDate.js';
import { type LoggerConfig, Logger } from '../misc/Logger.js';

// Default values that will be used if not specified in the config
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_RETRY_DELAY_MS = 10000;

/**
 * PostgreSQL database helper class using registry pattern
 */
export class DBPostgres {
    private static readonly instances: Map<string, DBPostgres> = new Map();
    private static readonly DEFAULT_KEY = 'default';
    private db?: Pool | undefined;
    private config: DBConfig;
    private readonly logFolder: string;
    private readonly maxRetries: number;
    private readonly logger: Logger | null = null;
    private readonly retryDelayMs: number;

    /**
     * Private constructor
     * @param config Database configuration
     */
    private constructor(config: DBConfig) {
        this.config = config;
        this.logFolder = config.logFolder;
        this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

        // Create log directory if it doesn't exist and a log path is provided
        if (this.logFolder) {
            try {
                const logDir = path.dirname(this.logFolder);

                if (!existsSync(logDir)) {
                    mkdirSync(logDir, { recursive: true });
                }

                const getLogger = (config: LoggerConfig) => {
                    return Logger.getInstance(config);
                };

                const verbose = process.argv.includes('--verbose');
                const debug = process.argv.includes('--debug');

                this.logger = getLogger({
                    logDir: this.logFolder,
                    verbose,
                    debug
                });
            } catch (error) {
                console.error('Failed to create log directory:', error);
            }
        }
    }

    /**
     * Get an instance of DBPostgres
     * @param config Database configuration
     * @param key Optional key to identify the instance (defaults to 'default')
     * @returns DBPostgres instance
     */
    public static getInstance(config?: DBConfig, key?: string) {
        const instanceKey = key || DBPostgres.DEFAULT_KEY;
        const instance = DBPostgres.instances.get(instanceKey);

        if (!instance) {
            if (!config) {
                throw new Error(`DBPostgres instance with key "${instanceKey}" not initialized. Please provide configuration.`);
            }

            const newInstance = new DBPostgres(config);
            DBPostgres.instances.set(instanceKey, newInstance);
            return newInstance;
        } else if (config) {
            // If config is provided and instance exists, update the config
            instance.config = config;
            // Close existing connection to apply new config on next getPool call
            // eslint-disable-next-line no-void
            void instance.closeConnection();
        }

        return instance;
    }

    /**
     * Get all registered instance keys
     * @returns Array of instance keys
     */
    public static getInstanceKeys(): string[] {
        return Array.from(DBPostgres.instances.keys());
    }

    /**
     * Remove an instance from the registry
     * @param key The key of the instance to remove
     * @returns true if the instance was found and removed, false otherwise
     */
    public static async removeInstance(key: string): Promise<boolean> {
        const instance = DBPostgres.instances.get(key);

        if (instance) {
            await instance.closeConnection();
            return DBPostgres.instances.delete(key);
        }

        return false;
    }

    /**
     * Get or create the database connection pool
     * @returns Pool instance
     */
    getPool() {
        if (this.db) return this.db;

        const connectionLimit = this.config.connectionLimit || 3;

        this.db = new Pool({
            host: this.config.host,
            user: this.config.user,
            password: this.config.password,
            database: this.config.db,
            max: connectionLimit,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 30000
            // PostgreSQL handles numeric types differently than MySQL
        });

        return this.db;
    }

    async closeConnection() {
        if (this.db) await this.db.end();
        this.db = undefined;
    }

    async doSelectMultiple<T extends object>(
        queryString: string,
        parameters?: DbParameters,
        connection?: PoolClient,
        verbose?: boolean
    ): Promise<T[]> {
        let dbConnection: Pool | PoolClient = connection ? connection : this.getOrThrowPool();
        let retryAttempts = 0;

        while (retryAttempts < this.maxRetries) {
            try {
                if (verbose) console.log(`Executing query: ${queryString}`, parameters);

                // PostgreSQL uses parameterized queries differently than MySQL
                // Use proper type casting for pg query parameters
                let paramArray: (string | number | boolean | null)[] = [];

                if (parameters) {
                    if (Array.isArray(parameters)) {
                        paramArray = parameters as (string | number | boolean | null)[];
                    } else {
                        paramArray = [parameters as string | number | boolean | null];
                    }
                }

                const result = await dbConnection.query(queryString, paramArray);
                return result.rows as T[];
            } catch (e: unknown) {
                if (this.isPoolClosedError(e)) {
                    if (!connection) {
                        console.warn('Pool was closed, recreating pool.');
                        // To avoid spamming re-creations
                        await sleep(10000);
                        await this.closeConnection();
                        dbConnection = this.getPool();
                    } else {
                        // If a specific connection is provided, we can't recreate the pool
                        this.handleError(e);
                        throw e;
                    }
                } else if (this.isTransientError(e) && retryAttempts < this.maxRetries) {
                    const errorCode = (e as { code?: string }).code;
                    const errorType = this.getErrorType(errorCode);

                    console.warn(
                        // eslint-disable-next-line max-len
                        `[${errorType}] Retryable error encountered: ${errorCode || 'Unknown'} - ${(e as Error).message}. Retrying (${retryAttempts + 1}/${this.maxRetries})...`
                    );

                    await sleep(this.retryDelayMs * (retryAttempts + 1));

                    if (!connection && (e as { code?: string }).code === '08001') {
                        await this.closeConnection();
                        dbConnection = this.getPool();
                    }
                } else {
                    this.handleError(e);
                    throw e;
                }

                retryAttempts++;
            }
        }

        throw new Error(`Max retries (${this.maxRetries}) reached for query: ${queryString}`);
    }

    async doQuery(config: {
        queryString: string;
        parameters?: DbParametersWithDate | undefined;
        connection?: PoolClient | undefined;
        verbose?: boolean | undefined;
    }): Promise<QueryResult | void> {
        const { queryString, parameters, connection, verbose } = config;
        const dbConnection: Pool | PoolClient = connection ? connection : this.getOrThrowPool();
        let retryAttempts = 0;

        while (retryAttempts < this.maxRetries) {
            try {
                if (verbose) console.log(`Executing query: ${queryString}`, parameters);

                // PostgreSQL uses parameterized queries differently than MySQL
                // eslint-disable-next-line no-nested-ternary
                const paramArray = parameters ? (Array.isArray(parameters) ? parameters : [parameters]) : [];
                const result = await dbConnection.query(queryString, paramArray as (string | number | boolean | null)[]);

                return result;
            } catch (e: unknown) {
                retryAttempts++;

                if (this.isTransientError(e) && retryAttempts < this.maxRetries) {
                    const errorCode = (e as { code?: string }).code;
                    const errorType = this.getErrorType(errorCode);

                    console.warn(
                        // eslint-disable-next-line max-len
                        `[${errorType}] Retryable error encountered: ${errorCode || 'Unknown'} - ${(e as Error).message}. Retrying (${retryAttempts}/${this.maxRetries})...`
                    );

                    await sleep(this.retryDelayMs * retryAttempts);
                } else {
                    this.handleError(e);
                    break;
                }
            }
        }
    }

    async insert<T extends object>(config: {
        table: string;
        params: Insertable<T>;
        shouldIgnore?: boolean;
        updateOnDuplicate?: boolean;
        onDuplicateKeyUpdateColumns?: (keyof T)[];
        connection?: PoolClient;
        verbose?: boolean;
    }): Promise<number | void> {
        const { connection, verbose } = config;
        const columns = Object.keys(config.params) as (keyof T)[];

        // Create parameter placeholders in PostgreSQL style: $1, $2, etc.
        const placeholderValues = columns.map((_, index) => `$${index + 1}`);
        const placeholders = `(${placeholderValues.join(', ')})`;

        let queryString = `
            INSERT INTO "${config.table}" (${columns.map((col) => `"${String(col)}"`).join(', ')})
            VALUES ${placeholders}
        `;

        if (config.updateOnDuplicate) {
            // Need to identify the primary key for the table
            // This is a simplification - in practice you'd need to know which column(s) are the primary key
            const primaryKey = 'id';
            const updateColumns = config.onDuplicateKeyUpdateColumns || columns.filter((col) => String(col) !== primaryKey);

            const duplicateUpdateClause = updateColumns.map((col) => `"${String(col)}" = EXCLUDED."${String(col)}"`).join(', ');

            queryString += ` ON CONFLICT ("${primaryKey}") DO UPDATE SET ${duplicateUpdateClause}`;
        } else if (config.shouldIgnore) {
            queryString += ` ON CONFLICT DO NOTHING`;
        }

        // Add RETURNING to get the inserted ID in PostgreSQL
        queryString += ` RETURNING id;`;

        const values = columns.map((column) => config.params[column]);

        try {
            return await this.doInsert({ queryString, parameters: values, retryAttempts: 0, verbose, connection });
        } catch (e: unknown) {
            console.error('Insert failed:', e);
        }
    }

    async insertMultiple<T extends object>(config: {
        table: string;
        values: Insertable<T>[];
        shouldIgnore?: boolean;
        onDuplicateKeyUpdate?: boolean;
        onDuplicateKeyUpdateColumns?: (keyof T)[];
        connection?: PoolClient;
        verbose?: boolean;
    }): Promise<number | void> {
        if (config.values.length === 0) return;

        const { connection, verbose } = config;

        // For larger datasets, use COPY for better performance
        const COPY_THRESHOLD = 1000;

        if (config.values.length >= COPY_THRESHOLD) {
            try {
                // Create a new config object with only defined properties to avoid TypeScript errors
                const copyConfig: {
                    table: string;
                    values: Insertable<T>[];
                    connection?: PoolClient;
                    verbose?: boolean;
                } = {
                    table: config.table,
                    values: config.values
                };

                if (connection !== undefined) {
                    copyConfig.connection = connection;
                }

                if (verbose !== undefined) {
                    copyConfig.verbose = verbose;
                }

                return await this.bulkCopy(copyConfig);
            } catch (e: unknown) {
                console.error('Bulk copy failed:', e);

                if (verbose) {
                    console.log('Falling back to batched INSERT method');
                }
                // Fall back to the regular batched INSERT method below
            }
        }

        // Make sure we have values before trying to get keys
        if (!config.values?.length || !config.values[0]) {
            console.error('No values provided for insertMultiple');
            return;
        }

        const columns = Object.keys(config.values[0]) as (keyof T)[];

        // For PostgreSQL, we need to use a different approach for bulk inserts with parameterized values
        // Using the VALUES (...), (...), ... syntax with properly numbered parameters
        let paramCounter = 1;
        const valueStrings = [];
        const values: unknown[] = [];

        for (const row of config.values) {
            const rowPlaceholders: string[] = [];

            for (const column of columns) {
                rowPlaceholders.push(`$${paramCounter}`);
                values.push(row[column]);
                paramCounter++;
            }

            valueStrings.push(`(${rowPlaceholders.join(', ')})`);
        }

        let queryString = `
          INSERT INTO "${config.table}" (${columns.map((col) => `"${String(col)}"`).join(', ')})
          VALUES ${valueStrings.join(', ')}
        `;

        if (config.onDuplicateKeyUpdate) {
            // Need to identify the primary key for the table
            // This is a simplification - in practice you'd need to know which column(s) are the primary key
            const primaryKey = 'id';
            const updateColumns = config.onDuplicateKeyUpdateColumns || columns.filter((col) => String(col) !== primaryKey);

            const updateClause = updateColumns.map((col) => `"${String(col)}" = EXCLUDED."${String(col)}"`).join(', ');

            queryString += ` ON CONFLICT ("${primaryKey}") DO UPDATE SET ${updateClause}`;
        } else if (config.shouldIgnore) {
            queryString += ` ON CONFLICT DO NOTHING`;
        }

        // Add RETURNING to get the inserted ID in PostgreSQL (will return only the last inserted ID)
        queryString += ` RETURNING id;`;

        try {
            return await this.doInsert({
                queryString,
                parameters: values,
                retryAttempts: 0,
                verbose,
                connection
            });
        } catch (e: unknown) {
            console.error('Insert multiple failed:', e);
        }
    }

    /**
     * Bulk copy data into a PostgreSQL table using the COPY FROM STDIN protocol.
     * This is much faster than INSERT for large datasets.
     */
    // eslint-disable-next-line max-statements
    async bulkCopy<T extends object>(config: {
        table: string;
        values: Insertable<T>[];
        connection?: PoolClient;
        verbose?: boolean;
    }): Promise<number | void> {
        if (config.values.length === 0) return;

        const { table, values, verbose } = config;
        let clientSupplied = false;
        let client: PoolClient | null = null;

        try {
            if (config.connection) {
                client = config.connection;
                clientSupplied = true;
            } else {
                client = await this.getOrThrowPool().connect();
                clientSupplied = false;
            }

            if (verbose) {
                console.log(`Starting COPY operation for ${values.length} rows to table "${table}"`);
            }

            // First, get the column names from the first row
            const columns = Object.keys(values[0] as object);
            const columnsList = columns.map((col) => `"${col}"`).join(', ');

            // Start a transaction
            await client.query('BEGIN');

            // Instead of using the COPY streaming approach, let's build a VALUES clause with all data
            // and use a regular INSERT query for compatibility
            const batchSize = 1000; // Process in batches of 1000 rows to avoid memory issues
            const totalRows = values.length;
            let insertedCount = 0;

            for (let i = 0; i < totalRows; i += batchSize) {
                const batch = values.slice(i, Math.min(i + batchSize, totalRows));

                // Build the VALUES clauses and parameter array
                let paramIndex = 1;
                const parameters: unknown[] = [];
                const valueClauses: string[] = [];

                for (const row of batch) {
                    const rowValues: string[] = [];

                    for (const col of columns) {
                        rowValues.push(`$${paramIndex}`);
                        parameters.push(row[col as keyof typeof row]);
                        paramIndex++;
                    }

                    valueClauses.push(`(${rowValues.join(', ')})`);
                }

                // Build the full INSERT query
                const insertQuery = `INSERT INTO "${table}" (${columnsList}) VALUES ${valueClauses.join(', ')}`;

                // Execute the INSERT query
                await client.query(insertQuery, parameters);
                insertedCount += batch.length;

                if (verbose) {
                    console.log(`Inserted batch of ${batch.length} rows (${insertedCount}/${totalRows})`);
                }
            }

            // Commit the transaction
            await client.query('COMMIT');

            if (verbose) {
                console.log(`Successfully inserted ${insertedCount} rows into "${table}"`);
            }

            return insertedCount;
        } catch (error) {
            if (client && !clientSupplied) {
                try {
                    await client.query('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Error during rollback:', rollbackError);
                }
            }

            throw error;
        } finally {
            // Release the client if we acquired it
            if (client && !clientSupplied) {
                client.release();
            }
        }
    }

    async update<T extends object>(config: {
        table: string;
        connection?: PoolClient;
        params: Partial<Insertable<T>>;
        where?: WhereCondition<T>[] | WhereCondition<T>;
        whereOperator?: 'AND' | 'OR';
        allowFullUpdate?: boolean;
        verbose?: boolean;
    }): Promise<QueryResult | void> {
        const { connection, verbose } = config;
        const updateColumns = Object.keys(config.params) as (keyof T)[];

        if (updateColumns.length === 0) {
            console.error(`No columns provided for update. ${JSON.stringify(config)}`);
            return;
        }

        // Fix the parameter placeholders to use $1, $2, etc.
        let paramCounter = 1;
        const updateClause = updateColumns.map((col) => `"${String(col)}" = $${paramCounter++}`).join(', ');
        const updateValues = updateColumns.map((col) => config.params[col]);
        let queryString: string;
        let parameters: unknown[] = updateValues;

        if (config.where) {
            const whereConditions = Array.isArray(config.where) ? config.where : [config.where];

            if (whereConditions.length > 0) {
                const {
                    clause: whereClause,
                    values: whereValues
                    // nextParamIndex is unused, so removing it from destructuring
                } = this.buildWhereClauseWithParams(whereConditions, config.whereOperator ?? 'AND', paramCounter);

                queryString = `UPDATE "${config.table}" SET ${updateClause} WHERE ${whereClause};`;
                parameters = [...updateValues, ...whereValues];
            } else if (config.allowFullUpdate) {
                queryString = `UPDATE "${config.table}" SET ${updateClause};`;
            } else {
                console.error(`No WHERE conditions provided. To update every row, set allowFullUpdate to true ${JSON.stringify(config)}`);
                return;
            }
        } else if (config.allowFullUpdate) {
            queryString = `UPDATE "${config.table}" SET ${updateClause};`;
        } else {
            console.error(`No WHERE conditions provided. To update every row, set allowFullUpdate to true ${JSON.stringify(config)}`);
            return;
        }

        return this.doQuery({ queryString, parameters: parameters as DbParameters, connection, verbose });
    }

    async delete<T extends object>(config: {
        table: string;
        where?: WhereCondition<T>[] | WhereCondition<T>;
        logicalOperator?: 'AND' | 'OR';
        allowFullDelete?: boolean;
        verbose?: boolean;
    }): Promise<QueryResult | void> {
        if (!this.db) this.getOrThrowPool();
        const { verbose } = config;
        let queryString: string;
        let parameters: unknown[] = [];
        const paramIndex = 1;

        // Convert the where condition to an array if necessary
        if (config.where) {
            const whereConditions = Array.isArray(config.where) ? config.where : [config.where];

            if (whereConditions.length > 0) {
                const { clause: whereClause, values: whereValues } = this.buildWhereClauseWithParams(
                    whereConditions,
                    config.logicalOperator ?? 'AND',
                    paramIndex
                );

                queryString = `DELETE FROM "${config.table}" WHERE ${whereClause};`;
                parameters = whereValues;
            } else if (config.allowFullDelete) {
                queryString = `DELETE FROM "${config.table}";`;
            } else {
                throw new Error('No WHERE conditions provided. To delete every row, set allowFullDelete to true.');
            }
        } else if (config.allowFullDelete) {
            queryString = `DELETE FROM "${config.table}";`;
        } else {
            throw new Error('No WHERE conditions provided. To delete every row, set allowFullDelete to true.');
        }

        return this.doQuery({ queryString, parameters: parameters as DbParameters, verbose });
    }

    // eslint-disable-next-line complexity
    private buildWhereClauseWithParams<T>(
        conditions: WhereCondition<T>[],
        joinOperator: 'AND' | 'OR',
        startParamIndex: number = 1
    ): { clause: string; values: unknown[]; nextParamIndex: number } {
        const parts: string[] = [];
        const values: unknown[] = [];
        let paramIndex = startParamIndex;

        for (const condition of conditions) {
            if ('group' in condition) {
                const operator = condition.operator ?? 'AND';

                const {
                    clause: groupClause,
                    values: groupValues,
                    nextParamIndex
                } = this.buildWhereClauseWithParams(condition.group, operator, paramIndex);

                parts.push(`(${groupClause})`);
                values.push(...groupValues);
                paramIndex = nextParamIndex;
                continue;
            }

            if (condition.value === null) {
                let op = condition.operator ?? '=';
                if (op === '=') op = 'IS';
                else if (op === '!=' || op === '<>') op = 'IS NOT';
                parts.push(`"${String(condition.column)}" ${op} NULL`);
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

                    parts.push(`"${String(condition.column)}" ${upperOperator} $${paramIndex} AND $${paramIndex + 1}`);
                    values.push(value[0], value[1]);
                    paramIndex += 2;
                } else if (upperOperator === 'IN' && Array.isArray(value)) {
                    const placeholders: string[] = [];

                    for (let i = 0; i < value.length; i++) {
                        placeholders.push(`$${paramIndex}`);
                        values.push(value[i]);
                        paramIndex++;
                    }

                    parts.push(`"${String(condition.column)}" IN (${placeholders.join(', ')})`);
                } else {
                    parts.push(`"${String(condition.column)}" ${operator} $${paramIndex}`);
                    values.push(value);
                    paramIndex++;
                }
            }
        }

        return {
            clause: parts.join(` ${joinOperator} `),
            values,
            nextParamIndex: paramIndex
        };
    }

    // eslint-disable-next-line complexity, max-statements
    async doInsert<T>(config: {
        queryString: string;
        parameters?: T[] | DbParameters | undefined;
        retryAttempts: number;
        connection?: PoolClient | undefined;
        verbose?: boolean | undefined;
    }): Promise<number | void> {
        const { queryString, parameters, connection, verbose } = config;
        const { retryAttempts = 0 } = config;
        let dbConnection: Pool | PoolClient = connection ? connection : this.getOrThrowPool();

        try {
            if (verbose) {
                console.log(`Executing query: ${queryString}`);

                if (parameters) {
                    console.log(`Parameter count: ${Array.isArray(parameters) ? parameters.length : 'not an array'}`);

                    if (Array.isArray(parameters) && parameters.length > 1000) {
                        console.log(
                            `Large parameter array detected (${parameters.length} items), showing first few:`,
                            parameters.slice(0, 5)
                        );
                    } else {
                        console.log(`Parameters:`, parameters);
                    }
                } else {
                    console.log('No parameters provided');
                }
            }

            // PostgreSQL uses parameterized queries differently than MySQL
            // Ensure parameters is always an array that pg can handle
            let paramArray: (string | number | boolean | null)[] = [];

            if (parameters) {
                if (Array.isArray(parameters)) {
                    paramArray = parameters as (string | number | boolean | null)[];
                } else {
                    paramArray = [parameters as string | number | boolean | null];
                }
            }

            const result = await dbConnection.query(queryString, paramArray);

            // In PostgreSQL, we need to check if the query returned any rows and has an id
            if (result.rows && result.rows.length > 0 && result.rows[0] && 'id' in result.rows[0]) {
                return result.rows[0].id as number;
            }

            // If no id field was returned, return the number of affected rows
            return result.rowCount || 0;
        } catch (e: unknown) {
            if (this.isPoolClosedError(e)) {
                if (!connection) {
                    console.warn('Pool was closed, recreating pool.');

                    await sleep(10000);
                    await this.closeConnection();
                    dbConnection = this.getPool();
                    return this.doInsert({ queryString, parameters, retryAttempts: 0, verbose, connection });
                } else {
                    this.handleError(e);
                    throw e;
                }
            } else if (this.isTransientError(e, true) && retryAttempts < this.maxRetries) {
                const errorCode = (e as { code?: string }).code;
                const errorType = this.getErrorType(errorCode);

                console.warn(
                    // eslint-disable-next-line max-len
                    `[${errorType}] Insert transient error: ${errorCode || 'Unknown'} - ${(e as Error).message}. Retrying in ${this.retryDelayMs} ms...`
                );

                if (!connection) {
                    await this.closeConnection();
                    await sleep(retryAttempts * this.retryDelayMs);
                    dbConnection = this.getPool();
                } else {
                    await sleep(retryAttempts * this.retryDelayMs);
                }

                return this.doInsert({ queryString, parameters, retryAttempts: retryAttempts + 1, connection, verbose });
            } else {
                this.handleError(e);
                throw e;
            }
        }
    }

    async select<T extends object, C extends (keyof T)[] | undefined = undefined>(
        config: SelectConfigPg<T, C>
    ): Promise<SelectReturn<T, C>> {
        if (!this.db) this.getOrThrowPool();
        const { queryString, params } = this.buildUnionableSelectQuery(config);

        try {
            const result = await this.doSelectMultiple<T>(queryString, params as DbParameters, config.connection, config.verbose);

            return result as unknown as SelectReturn<T, C>;
        } catch (error) {
            this.handleError(error);
            console.error(`Error in select ${JSON.stringify({ queryString, params })}`);
            throw error;
        }
    }

    async selectOne<T extends object, C extends (keyof T)[] | undefined = undefined>(
        config: SelectConfigPg<T, C>
    ): Promise<SelectReturn<T, C>[0] | undefined> {
        // Optionally force LIMIT 1 here (if not already specified)
        if (config.limit === undefined) {
            config.limit = 1;
        }

        const results = await this.select<T, C>(config);
        return results[0];
    }

    async unionSelect<T extends object, C extends (keyof T)[] | undefined = undefined>(
        configs: SelectConfigPg<T, C>[],
        config: {
            unionType: 'UNION' | 'UNION ALL';
            finalOrderBy?: { column: keyof T; direction?: 'ASC' | 'DESC' } | { column: keyof T; direction?: 'ASC' | 'DESC' }[];
            finalLimit?: number;
            finalOffset?: number;
            connection?: PoolClient;
            verbose?: boolean;
        }
    ): Promise<SelectReturn<T, C>> {
        if (configs.length === 0) {
            throw new Error('No select configs provided for unionSelect.');
        }

        const { unionType, finalOrderBy, finalLimit, finalOffset, connection, verbose } = config;

        const queryParts: string[] = [];
        const parameters: unknown[] = [];
        let paramIndex = 1;

        // Build each individual SELECT query (without the trailing semicolon)
        for (const selectConfig of configs) {
            const { queryString, params, nextParamIndex } = this.buildUnionableSelectQuery(selectConfig, paramIndex);
            queryParts.push(`(${queryString})`);
            parameters.push(...params);
            paramIndex = nextParamIndex;
        }

        // Join all SELECT queries with the specified UNION operator
        let unionQuery = queryParts.join(` ${unionType} `);

        // Optionally append a final ORDER BY clause
        if (finalOrderBy) {
            const orderByArray = Array.isArray(finalOrderBy) ? finalOrderBy : [finalOrderBy];

            if (orderByArray.length > 0) {
                const orderByPart = orderByArray.map((ob) => `"${String(ob.column)}" ${ob.direction ?? 'ASC'}`).join(', ');
                unionQuery += ` ORDER BY ${orderByPart}`;
            }
        }

        // Optionally append a final LIMIT/OFFSET clause
        if (typeof finalLimit === 'number') {
            unionQuery += ` LIMIT $${paramIndex++}`;
            parameters.push(finalLimit);

            if (typeof finalOffset === 'number') {
                unionQuery += ` OFFSET $${paramIndex}`;
                parameters.push(finalOffset);
            }
        }

        unionQuery += ';';

        // Execute the union query
        const rows = await this.doSelectMultiple<T>(unionQuery, parameters as DbParameters, connection, verbose);
        return rows as SelectReturn<T, C>;
    }

    // Helper method that builds a SELECT query string from a SelectConfig
    private buildUnionableSelectQuery<T extends object, C extends (keyof T)[] | undefined = undefined>(
        config: SelectConfig<T, C>,
        startParamIndex = 1
    ): { queryString: string; params: unknown[]; nextParamIndex: number } {
        const { columnsPart, params, paramIndex } = this.buildColumnsPart(config, startParamIndex);

        // Build the query string
        let queryString = `SELECT ${columnsPart} FROM "${config.table}"`;
        let nextParamIndex = paramIndex;

        // Add WHERE clause
        if (config.where) {
            const whereConditions = Array.isArray(config.where) ? config.where : [config.where];

            if (whereConditions.length > 0) {
                const {
                    clause: whereClause,
                    values: whereValues,
                    nextParamIndex: whereNextParamIndex
                } = this.buildWhereClauseWithParams(whereConditions, config.whereOperator ?? 'AND', nextParamIndex);

                queryString += ` WHERE ${whereClause ? whereClause : '1'}`;
                params.push(...whereValues);
                nextParamIndex = whereNextParamIndex;
            }
        }

        return this.finishSelectQuery(queryString, config, params, nextParamIndex);
    }

    // Helper to build the column part of a SELECT query
    private buildColumnsPart<T extends object, C extends (keyof T)[] | undefined = undefined>(
        config: SelectConfig<T, C>,
        startParamIndex = 1
    ): { columnsPart: string; params: unknown[]; paramIndex: number } {
        let plainColumnsPart: string | null = null;
        const paramIndex = startParamIndex;
        const params: unknown[] = [];

        if (config.columns) {
            // Exclude any plain column that is also wrapped.
            const wrappedColumns = config.computedColumns ? config.computedColumns.map((wrapper) => wrapper.column) : [];

            plainColumnsPart = config.columns
                .filter((col) => !wrappedColumns.includes(col))
                .map((col) => `"${String(col)}"`)
                .join(', ');
        }

        // Build wrappers part (if provided)
        let wrappersPart: string | null = null;

        if (config.computedColumns && config.computedColumns.length > 0) {
            wrappersPart = config.computedColumns
                .map((wrapperObj) => {
                    const colName = `"${String(wrapperObj.column)}"`;
                    const alias = wrapperObj.alias ? ` AS "${wrapperObj.alias}"` : ``;
                    return wrapperObj.wrapper === 'DISTINCT' ? `DISTINCT ${colName}${alias}` : `${wrapperObj.wrapper}(${colName})${alias}`;
                })
                .join(', ');
        }

        // Determine the final columns part
        let columnsPart: string;

        if (plainColumnsPart && wrappersPart) {
            columnsPart = `${plainColumnsPart}, ${wrappersPart}`;
        } else if (plainColumnsPart) {
            columnsPart = plainColumnsPart;
        } else if (wrappersPart) {
            columnsPart = wrappersPart;
        } else {
            columnsPart = '*';
        }

        // Append any raw columns if provided.
        if (config.rawColumns && config.rawColumns.length > 0) {
            // If columnsPart is '*' then use rawColumns directly, else append.
            columnsPart = columnsPart === '*' ? config.rawColumns.join(', ') : `${columnsPart}, ${config.rawColumns.join(', ')}`;
        }

        return { columnsPart, params, paramIndex };
    }

    // Helper to finish building a SELECT query with GROUP BY, ORDER BY, etc.
    private finishSelectQuery<T extends object, C extends (keyof T)[] | undefined = undefined>(
        queryString: string,
        config: SelectConfigPg<T, C>,
        params: unknown[],
        paramIndex: number
    ): { queryString: string; params: unknown[]; nextParamIndex: number } {
        // GROUP BY clause – if provided
        if (config.groupBy) {
            const groupByArray = Array.isArray(config.groupBy) ? config.groupBy : [config.groupBy];

            if (groupByArray.length > 0) {
                const groupByPart = groupByArray.map((col) => `"${String(col)}"`).join(', ');
                queryString += ` GROUP BY ${groupByPart}`;
            }
        }

        // Optionally include individual ORDER BY and LIMIT clauses if provided
        if (config.orderBy) {
            const orderByArray = Array.isArray(config.orderBy) ? config.orderBy : [config.orderBy];

            if (orderByArray.length > 0) {
                const orderByPart = orderByArray.map((ob) => `"${String(ob.column)}" ${ob.direction ?? 'ASC'}`).join(', ');
                queryString += ` ORDER BY ${orderByPart}`;
            }
        }

        // Use the current paramIndex for the LIMIT/OFFSET clauses
        // This ensures we don't reuse parameter numbers that were already used in the WHERE clause
        if (typeof config.limit === 'number') {
            queryString += ` LIMIT $${paramIndex}`;
            params.push(config.limit);
            paramIndex++;

            if (typeof config.offset === 'number') {
                queryString += ` OFFSET $${paramIndex}`;
                params.push(config.offset);
                paramIndex++;
            }
        }

        // Remove any trailing semicolon
        queryString = queryString.trim().replace(/;$/, '');
        return { queryString, params, nextParamIndex: paramIndex };
    }

    private getOrThrowPool() {
        if (!this.db) this.getPool();
        if (!this.db) throw new Error(`No db!`);
        return this.db;
    }

    private isPoolClosedError(error: unknown): boolean {
        return error instanceof Error && error.message.includes('Pool is closed.');
    }

    private handleError(e: unknown) {
        if (this.logger) {
            try {
                if (e instanceof Error) {
                    const argString = process.argv.slice(1).join(' ');

                    // eslint-disable-next-line max-len
                    const logEntry = `${argString}\nError Stack: ${e.stack ?? ''}\n Datetime: ${getDate({ format: 'ymdhms' })}\n${JSON.stringify(
                        e,
                        null,
                        4
                    )}`;

                    this.logger.log({
                        level: 'error',
                        severity: 8,
                        message: logEntry,
                        error: e
                    });
                } else {
                    console.error('Failed to write to log file:', e);
                }
            } catch (logError) {
                console.error('Failed to write to log file:', logError);
            }
        } else {
            console.error('Database error:', e instanceof Error ? e.message : e);
        }
    }

    private getErrorType(code: string | undefined): string {
        if (!code) return 'Database Error';

        // Network errors
        if (
            ['EADDRNOTAVAIL', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN'].includes(code)
        ) {
            return 'Network Error';
        }

        // DNS errors
        if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
            return 'DNS Error';
        }

        // PostgreSQL connection errors
        if (['08001', '08003', '08006', '57P01', '57P02', '57P03'].includes(code)) {
            return 'PostgreSQL Connection Error';
        }

        // PostgreSQL transaction errors
        if (['40001', '40P01'].includes(code)) {
            return 'PostgreSQL Transaction Error';
        }

        return 'Database Error';
    }

    private isTransientError(error: unknown, isInsert: boolean = false): boolean {
        const pgError = error as { code?: string; errno?: number; syscall?: string; message?: string };

        // Check for network-level errors (these occur at TCP/IP level, not PostgreSQL level)
        if (pgError?.code && typeof pgError.code === 'string') {
            const networkErrorCodes = [
                'EADDRNOTAVAIL', // Address not available (common when network disconnects)
                'ECONNREFUSED', // Connection refused
                'ETIMEDOUT', // Connection timeout
                'ECONNRESET', // Connection reset by peer
                'EPIPE', // Broken pipe
                'ENETUNREACH', // Network unreachable
                'EHOSTUNREACH', // Host unreachable
                'ENETDOWN', // Network is down
                'ENOTFOUND', // DNS lookup failed
                'EAI_AGAIN' // DNS temporary failure
            ];

            if (networkErrorCodes.includes(pgError.code)) {
                return true;
            }
        }

        // Check for error messages that indicate connection issues
        if (pgError?.message) {
            const connectionErrorPatterns = [
                'Connection terminated unexpectedly',
                'terminating connection',
                'connection lost',
                'read ECONNRESET',
                'Client has encountered a connection error',
                'FATAL: terminating connection due to administrator command',
                'server closed the connection unexpectedly'
            ];

            if (connectionErrorPatterns.some((pattern) => pgError?.message?.includes(pattern))) {
                return true;
            }
        }

        // Original PostgreSQL error code checking
        if (!pgError?.code || typeof pgError.code !== 'string') return false;

        const readRetryErrors = [
            '57P01', // admin_shutdown
            '57P02', // crash_shutdown
            '57P03', // cannot_connect_now
            '53300', // too_many_connections
            '08006', // connection_failure
            '08003', // connection_does_not_exist
            '08001', // sqlclient_unable_to_establish_sqlconnection
            '2BP01', // dependent_objects_still_exist
            '40001', // serialization_failure
            '40P01', // deadlock_detected
            '57014', // query_canceled
            '57033' // imminent_database_shutdown
        ];

        const insertRetryErrors = ['40001', '40P01'];
        return isInsert ? insertRetryErrors.includes(pgError.code) : readRetryErrors.includes(pgError.code);
    }
}
