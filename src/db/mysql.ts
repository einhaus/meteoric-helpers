/* eslint-disable @typescript-eslint/naming-convention */
import type { DBConfig, DbParameters, Insertable, SelectConfigMysql, SelectReturn, WhereCondition } from './dbUtilityTypes.js';

import type { PoolConnection } from 'mysql2/promise.js';
// eslint-disable-next-line no-duplicate-imports
import mysql, { type Pool, type ResultSetHeader } from 'mysql2/promise.js';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { sleep } from '../misc/sleep.js';
import { getDate } from '../date/getDate.js';
// Default values that will be used if not specified in the config
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_RETRY_DELAY_MS = 10000;

/**
 * MySQL database helper class using registry pattern
 */
export class DBMysql {
    private static readonly instances: Map<string, DBMysql> = new Map();
    private static readonly DEFAULT_KEY = 'default';
    db?: Pool | undefined;
    private config: DBConfig;
    private readonly logFolder: string;
    private readonly maxRetries: number;
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
            } catch (error) {
                console.error('Failed to create log directory:', error);
            }
        }
    }

    /**
     * Get an instance of DBMysql
     * @param config Database configuration
     * @param key Optional key to identify the instance (defaults to 'default')
     * @returns DBMysql instance
     */
    public static getInstance(config?: DBConfig, key?: string) {
        const instanceKey = key || DBMysql.DEFAULT_KEY;
        const instance = DBMysql.instances.get(instanceKey);

        if (!instance) {
            if (!config) {
                throw new Error(`DBMysql instance with key "${instanceKey}" not initialized. Please provide configuration.`);
            }

            const newInstance = new DBMysql(config);
            DBMysql.instances.set(instanceKey, newInstance);
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
        return Array.from(DBMysql.instances.keys());
    }

    /**
     * Get or create the database connection pool
     * @returns Pool instance
     */
    getPool() {
        if (this.db) return this.db;

        const connectionLimit = this.config.connectionLimit || 3;

        this.db = mysql.createPool({
            host: this.config.host,
            user: this.config.user,
            password: this.config.password,
            database: this.config.db,
            multipleStatements: true,
            connectionLimit,
            dateStrings: true,
            connectTimeout: 30000
            // We don't use decimalNumbers, so we can fetch decimals as strings and convert them to numbers in the code
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
        connection?: PoolConnection,
        verbose?: boolean
    ): Promise<T[]> {
        let dbConnection: Pool | PoolConnection = connection ? connection : this.getOrThrowPool();
        let retryAttempts = 0;

        while (retryAttempts < this.maxRetries) {
            try {
                const query = dbConnection.format(queryString, parameters);
                const [rows] = await dbConnection.query(query);
                if (verbose) console.log(`Executing query: ${query}`);
                return rows as T[];
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
                    console.warn(
                        `Retryable error encountered (${(e as Error).message}). Retrying (${retryAttempts + 1}/${this.maxRetries})...`
                    );

                    await sleep(this.retryDelayMs * (retryAttempts + 1));

                    if (!connection && (e as { code?: string }).code === 'ECONNREFUSED') {
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

    // eslint-disable-next-line max-statements, complexity
    async select<T extends object, C extends (keyof T)[] | undefined = undefined>(
        config: SelectConfigMysql<T, C>
    ): Promise<SelectReturn<T, C>> {
        // Build plain columns part (if provided)
        let plainColumnsPart: string | null = null;

        if (config.columns) {
            // Exclude any plain column that is also wrapped.
            const wrappedColumns = config.computedColumns ? config.computedColumns.map((wrapper) => wrapper.column) : [];

            plainColumnsPart = config.columns
                .filter((col) => !wrappedColumns.includes(col))
                .map((col) => `\`${String(col)}\``)
                .join(', ');
        }

        // Build wrappers part (if provided)
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

        // Build the query string
        let queryString = `SELECT ${columnsPart} FROM \`${config.table}\``;
        const parameters: unknown[] = [];

        if (config.where) {
            const conditions = Array.isArray(config.where) ? config.where : [config.where];
            const { clause, values } = this.buildWhereClause(conditions, config.whereOperator ?? 'AND');
            queryString += ` WHERE ${clause ? clause : '1'}`;
            parameters.push(...values);
        }

        // GROUP BY clause – if provided
        if (config.groupBy) {
            const groupByArray = Array.isArray(config.groupBy) ? config.groupBy : [config.groupBy];

            if (groupByArray.length > 0) {
                const groupByPart = groupByArray.map((col) => `\`${String(col)}\``).join(', ');
                queryString += ` GROUP BY ${groupByPart}`;
            }
        }

        // ORDER BY clause
        if (config.orderBy) {
            const orderByArray = Array.isArray(config.orderBy) ? config.orderBy : [config.orderBy];

            if (orderByArray.length > 0) {
                const orderByPart = orderByArray.map((ob) => `\`${String(ob.column)}\` ${ob.direction ?? 'ASC'}`).join(', ');
                queryString += ` ORDER BY ${orderByPart}`;
            }
        }

        // LIMIT / OFFSET
        if (typeof config.limit === 'number') {
            queryString += ` LIMIT ?`;
            parameters.push(config.limit);

            if (typeof config.offset === 'number') {
                queryString += ` OFFSET ?`;
                parameters.push(config.offset);
            }
        }

        // FOR UPDATE clause
        if (config.forUpdate) queryString += ' FOR UPDATE';
        queryString += ';';

        const rows = await this.doSelectMultiple<T>(queryString, parameters as DbParameters, config.connection, config.verbose);
        return rows as SelectReturn<T, C>;
    }

    async selectOne<T extends object, C extends (keyof T)[] | undefined = undefined>(
        config: SelectConfigMysql<T, C>
    ): Promise<SelectReturn<T, C>[0] | undefined> {
        // Optionally force LIMIT 1 here (if not already specified)
        if (config.limit === undefined) {
            config.limit = 1;
        }

        const results = await this.select<T, C>(config);
        return results[0];
    }

    private buildWhereClause<T>(conditions: WhereCondition<T>[], joinOperator: 'AND' | 'OR'): { clause: string; values: unknown[] } {
        const parts: string[] = [];
        const values: unknown[] = [];

        for (const condition of conditions) {
            if ('group' in condition) {
                const operator = condition.operator ?? 'AND';
                const { clause, values: groupValues } = this.buildWhereClause(condition.group, operator);
                parts.push(`(${clause})`);
                values.push(...groupValues);
                continue;
            }

            if (condition.value === null) {
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

                    parts.push(`\`${String(condition.column)}\` ${upperOperator} ? AND ?`);
                    values.push(value[0], value[1]);
                } else if (upperOperator === 'IN' && Array.isArray(value)) {
                    parts.push(`\`${String(condition.column)}\` IN (?)`);
                    values.push(value);
                } else {
                    parts.push(`\`${String(condition.column)}\` ${operator} ?`);
                    values.push(value);
                }
            }
        }

        return { clause: parts.join(` ${joinOperator} `), values };
    }

    async doQuery(config: {
        queryString: string;
        parameters?: DbParameters | undefined;
        connection?: PoolConnection | undefined;
        verbose?: boolean | undefined;
    }): Promise<ResultSetHeader | void> {
        const { queryString, parameters, connection, verbose } = config;
        const dbConnection: Pool | PoolConnection = connection ? connection : this.getOrThrowPool();
        let retryAttempts = 0;
        const MAX_RETRIES = this.maxRetries;
        const RETRY_DELAY_MS = this.retryDelayMs;

        while (retryAttempts < MAX_RETRIES) {
            try {
                const query = dbConnection.format(queryString, parameters);
                if (verbose) console.log(`Executing query: ${query}`);
                const [row] = await dbConnection.query(query);
                return row as ResultSetHeader;
            } catch (e: unknown) {
                retryAttempts++;

                if (this.isTransientError(e) && retryAttempts < MAX_RETRIES) {
                    console.warn(`Retryable error encountered (${(e as Error).message}). Retrying (${retryAttempts}/${MAX_RETRIES})...`);

                    await sleep(RETRY_DELAY_MS * retryAttempts);
                } else {
                    this.handleError(e);
                    break;
                }
            }
        }
    }

    private getOrThrowPool() {
        if (!this.db) this.getPool();
        if (!this.db) throw new Error(`No db!`);
        return this.db;
    }

    private isPoolClosedError(error: unknown): boolean {
        return error instanceof Error && error.message.includes('Pool is closed.');
    }

    async doInsert<T>(config: {
        queryString: string;
        parameters?: T[] | DbParameters | undefined;
        retryAttempts: number;
        connection?: PoolConnection | undefined;
        verbose?: boolean | undefined;
    }): Promise<number | void> {
        const { queryString, parameters, connection, verbose } = config;
        const { retryAttempts = 0 } = config;
        let dbConnection: Pool | PoolConnection = connection ? connection : this.getOrThrowPool();

        const MAX_RETRIES = this.maxRetries;
        const RETRY_DELAY_MS = this.retryDelayMs;

        try {
            const query = dbConnection.format(queryString, parameters);
            if (verbose) console.log(`Executing query: ${query}`);
            const [row] = await dbConnection.query(query);
            const results = row as ResultSetHeader;
            return results.insertId;
        } catch (e: unknown) {
            if (this.isPoolClosedError(e)) {
                if (!connection) {
                    console.warn('Pool was closed, recreating pool.');

                    await sleep(10000);
                    await this.closeConnection();
                    dbConnection = this.getPool();
                    return this.doInsert({ queryString, parameters, retryAttempts: 0, connection, verbose });
                } else {
                    this.handleError(e);
                    throw e;
                }
            } else if (this.isTransientError(e, true) && retryAttempts < MAX_RETRIES) {
                console.warn(`Insert transient error (${(e as Error).message}). Retrying in ${RETRY_DELAY_MS} ms...`);

                if (!connection) {
                    await this.closeConnection();
                    await sleep(retryAttempts * RETRY_DELAY_MS);
                    dbConnection = this.getPool();
                } else {
                    await sleep(retryAttempts * RETRY_DELAY_MS);
                }

                return this.doInsert({ queryString, parameters, retryAttempts: retryAttempts + 1, connection, verbose });
            } else {
                this.handleError(e);
                throw e;
            }
        }
    }

    async insert<T extends object>(config: {
        table: string;
        params: Insertable<T>;
        shouldIgnore?: boolean;
        updateOnDuplicate?: boolean;
        connection?: PoolConnection;
        verbose?: boolean;
    }): Promise<number | void> {
        const { connection, verbose } = config;
        const columns = Object.keys(config.params) as (keyof T)[];
        const placeholders = `(${columns.map(() => '?').join(', ')})`;
        const ignore = config.shouldIgnore ? 'IGNORE' : '';

        let queryString = `
            INSERT ${ignore} INTO ${config.table} (${columns.join(', ')})
            VALUES ${placeholders}
        `;

        if (config.updateOnDuplicate) {
            const duplicateUpdateClause = columns.map((col) => `${col.toString()} = VALUES(${col.toString()})`).join(', ');
            queryString += ` ON DUPLICATE KEY UPDATE ${duplicateUpdateClause}`;
        }

        const values = columns.map((column) => config.params[column]);
        queryString += ';';

        try {
            return await this.doInsert({ queryString, parameters: values, retryAttempts: 0, verbose, connection });
        } catch (e: unknown) {
            console.log('Insert failed:', e);
        }
    }

    async insertMultiple<T extends object>(config: {
        table: string;
        values: Insertable<T>[];
        shouldIgnore?: boolean;
        onDuplicateKeyUpdate?: boolean;
        connection?: PoolConnection;
        verbose?: boolean;
    }): Promise<number | void> {
        if (!config.values || config.values.length === 0) return;
        const { connection, verbose } = config;

        // Make sure we have at least one item in the values array
        if (!config.values[0]) {
            console.error('No values provided for insertMultiple');
            return;
        }

        const columns = Object.keys(config.values[0]) as (keyof T)[];
        const ignore = config.shouldIgnore ? 'IGNORE' : '';

        let queryString = `
          INSERT ${ignore} INTO ${config.table} (${columns.join(', ')})
          VALUES ${config.values.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ')}
        `;

        if (config.onDuplicateKeyUpdate) {
            const updateClause = columns.map((col) => `${col.toString()} = VALUES(${col.toString()})`).join(', ');
            queryString += ` ON DUPLICATE KEY UPDATE ${updateClause}`;
        }

        const values = config.values.flatMap((param) => columns.map((column) => param[column]));
        queryString += ';';

        try {
            return await this.doInsert({ queryString, parameters: values, retryAttempts: 0, verbose, connection });
        } catch (e: unknown) {
            console.log('Insert multiple failed:', e);
        }
    }

    async update<T extends object>(config: {
        table: string;
        connection?: PoolConnection;
        params: Partial<Insertable<T>>;
        where?: WhereCondition<T>[] | WhereCondition<T>; // Accept a single condition or an array
        whereOperator?: 'AND' | 'OR';
        allowFullUpdate?: boolean;
        verbose?: boolean;
    }) {
        const { connection, verbose } = config;
        const updateColumns = Object.keys(config.params) as (keyof T)[];

        if (updateColumns.length === 0) {
            console.error(`No columns provided for update. ${JSON.stringify(config)}`);
            return;
        }

        const updateClause = updateColumns.map((col) => `\`${String(col)}\` = ?`).join(', ');
        const updateValues = updateColumns.map((col) => config.params[col]);
        let queryString: string;
        let parameters: unknown[] = updateValues;

        // Convert the where condition to an array if necessary
        if (config.where) {
            const whereConditions = Array.isArray(config.where) ? config.where : [config.where];

            if (whereConditions.length > 0) {
                const { clause: whereClause, values: whereValues } = this.buildWhereClause(whereConditions, config.whereOperator ?? 'AND');
                queryString = `UPDATE \`${config.table}\` SET ${updateClause} WHERE ${whereClause};`;
                parameters = [...updateValues, ...whereValues];
            } else if (config.allowFullUpdate) {
                queryString = `UPDATE \`${config.table}\` SET ${updateClause};`;
            } else {
                console.error(`No WHERE conditions provided. To update every row, set allowFullUpdate to true ${JSON.stringify(config)}`);
                return;
            }
        } else if (config.allowFullUpdate) {
            queryString = `UPDATE \`${config.table}\` SET ${updateClause};`;
        } else {
            console.error(`No WHERE conditions provided. To update every row, set allowFullUpdate to true ${JSON.stringify(config)}`);
            return;
        }

        return this.doQuery({ queryString, parameters: parameters as DbParameters, connection, verbose });
    }

    async unionSelect<T extends object, C extends (keyof T)[] | undefined = undefined>(
        configs: SelectConfigMysql<T, C>[],
        config: {
            unionType: 'UNION' | 'UNION ALL';
            finalOrderBy?: { column: keyof T; direction?: 'ASC' | 'DESC' } | { column: keyof T; direction?: 'ASC' | 'DESC' }[];
            finalLimit?: number;
            finalOffset?: number;
            connection?: PoolConnection;
            verbose?: boolean;
        }
    ): Promise<SelectReturn<T, C>> {
        if (configs.length === 0) {
            throw new Error('No select configs provided for unionSelect.');
        }

        const { unionType, finalOrderBy, finalLimit, finalOffset, connection, verbose } = config;

        const queryParts: string[] = [];
        const parameters: unknown[] = [];

        // Build each individual SELECT query (without the trailing semicolon)
        for (const config of configs) {
            const { queryString, params } = this.buildUnionableSelectQuery(config);
            queryParts.push(`(${queryString})`);
            parameters.push(...params);
        }

        // Join all SELECT queries with the specified UNION operator
        let unionQuery = queryParts.join(` ${unionType} `);

        // Optionally append a final ORDER BY clause
        if (finalOrderBy) {
            const orderByArray = Array.isArray(finalOrderBy) ? finalOrderBy : [finalOrderBy];

            if (orderByArray.length > 0) {
                const orderByPart = orderByArray.map((ob) => `\`${String(ob.column)}\` ${ob.direction ?? 'ASC'}`).join(', ');
                unionQuery += ` ORDER BY ${orderByPart}`;
            }
        }

        // Optionally append a final LIMIT/OFFSET clause
        if (typeof finalLimit === 'number') {
            unionQuery += ` LIMIT ?`;
            parameters.push(finalLimit);

            if (typeof finalOffset === 'number') {
                unionQuery += ` OFFSET ?`;
                parameters.push(finalOffset);
            }
        }

        unionQuery += ';';

        // Execute the union query
        const rows = await this.doSelectMultiple<T>(unionQuery, parameters as DbParameters, connection, verbose);
        return rows as SelectReturn<T, C>;
    }

    // Helper method that builds a SELECT query string from a SelectConfig
    // eslint-disable-next-line complexity
    private buildUnionableSelectQuery<T extends object, C extends (keyof T)[] | undefined = undefined>(
        config: SelectConfigMysql<T, C>
    ): { queryString: string; params: unknown[] } {
        // Build the columns part
        let plainColumnsPart: string | null = null;

        if (config.columns) {
            const wrappedColumns = config.computedColumns ? config.computedColumns.map((wrapper) => wrapper.column) : [];

            plainColumnsPart = config.columns
                .filter((col) => !wrappedColumns.includes(col))
                .map((col) => `\`${String(col)}\``)
                .join(', ');
        }

        let wrappersPart: string | null = null;

        if (config.computedColumns && config.computedColumns.length > 0) {
            wrappersPart = config.computedColumns
                .map((wrapperObj) => {
                    const colName = `\`${String(wrapperObj.column)}\``;
                    const alias = wrapperObj.alias ? ` AS \`${wrapperObj.alias}\`` : ``;

                    if (wrapperObj.wrapper === 'DISTINCT') {
                        return `DISTINCT ${colName}${alias}`;
                    } else {
                        return `${wrapperObj.wrapper}(${colName})${alias}`;
                    }
                })
                .join(', ');
        }

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

        // Start building the SELECT query string
        let queryString = `SELECT ${columnsPart} FROM \`${config.table}\``;
        const params: unknown[] = [];

        // WHERE clause
        if (config.where) {
            const conditions = Array.isArray(config.where) ? config.where : [config.where];
            const { clause, values } = this.buildWhereClause(conditions, config.whereOperator ?? 'AND');
            queryString += ` WHERE ${clause ? clause : '1'}`;
            params.push(...values);
        }

        // GROUP BY clause – add if groupBy is provided
        if (config.groupBy) {
            const groupByArray = Array.isArray(config.groupBy) ? config.groupBy : [config.groupBy];

            if (groupByArray.length > 0) {
                const groupByPart = groupByArray.map((col) => `\`${String(col)}\``).join(', ');
                queryString += ` GROUP BY ${groupByPart}`;
            }
        }

        // Optionally include individual ORDER BY and LIMIT clauses if provided
        if (config.orderBy) {
            const orderByArray = Array.isArray(config.orderBy) ? config.orderBy : [config.orderBy];

            if (orderByArray.length > 0) {
                const orderByPart = orderByArray.map((ob) => `\`${String(ob.column)}\` ${ob.direction ?? 'ASC'}`).join(', ');
                queryString += ` ORDER BY ${orderByPart}`;
            }
        }

        if (typeof config.limit === 'number') {
            queryString += ` LIMIT ?`;
            params.push(config.limit);

            if (typeof config.offset === 'number') {
                queryString += ` OFFSET ?`;
                params.push(config.offset);
            }
        }

        // Remove any trailing semicolon
        queryString = queryString.trim().replace(/;$/, '');
        return { queryString, params };
    }

    async delete<T extends object>(config: {
        table: string;
        where?: WhereCondition<T>[] | WhereCondition<T>; // Accept a single condition or an array
        logicalOperator?: 'AND' | 'OR';
        allowFullDelete?: boolean;
        verbose?: boolean;
    }) {
        if (!this.db) this.getOrThrowPool();
        const { verbose } = config;
        let queryString: string;
        let parameters: unknown[] = [];

        // Convert the where condition to an array if necessary
        if (config.where) {
            const whereConditions = Array.isArray(config.where) ? config.where : [config.where];

            if (whereConditions.length > 0) {
                const { clause: whereClause, values: whereValues } = this.buildWhereClause(
                    whereConditions,
                    config.logicalOperator ?? 'AND'
                );

                queryString = `DELETE FROM \`${config.table}\` WHERE ${whereClause};`;
                parameters = whereValues;
            } else if (config.allowFullDelete) {
                queryString = `DELETE FROM \`${config.table}\`;`;
            } else {
                throw new Error('No WHERE conditions provided. To delete every row, set allowFullDelete to true.');
            }
        } else if (config.allowFullDelete) {
            queryString = `DELETE FROM \`${config.table}\`;`;
        } else {
            throw new Error('No WHERE conditions provided. To delete every row, set allowFullDelete to true.');
        }

        return this.doQuery({ queryString, parameters: parameters as DbParameters, verbose });
    }

    private handleError(e: unknown) {
        if (this.logFolder) {
            try {
                if (e instanceof Error) {
                    const dateTime = getDate({ format: 'ymdhms' });
                    const fileName = `dbError-${dateTime}.log`;

                    const argString = process.argv.slice(1).join(' ');

                    // eslint-disable-next-line max-len
                    const logEntry = `${argString}\nError Stack: ${e.stack ?? ''}\n Datetime: ${getDate({ format: 'ymdhms' })}\n${JSON.stringify(
                        e,
                        null,
                        4
                    )}`;

                    writeFileSync(path.join(this.logFolder, fileName), logEntry);
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

    private isTransientError(error: unknown, isInsert: boolean = false): boolean {
        const mysqlError = error as { code?: string };
        if (!mysqlError?.code) return false;

        const readRetryErrors = [
            'ECONNRESET',
            'PROTOCOL_CONNECTION_LOST',
            'ECONNREFUSED',
            'ER_LOCK_DEADLOCK',
            'ETIMEDOUT',
            'ER_LOCK_WAIT_TIMEOUT',
            'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR'
        ];

        const insertRetryErrors = ['ER_LOCK_DEADLOCK', 'ECONNREFUSED'];
        return isInsert ? insertRetryErrors.includes(mysqlError.code) : readRetryErrors.includes(mysqlError.code);
    }
}
