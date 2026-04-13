/* eslint-disable @typescript-eslint/naming-convention */
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { getDate } from '../date/getDate.js';
import { type LoggerConfig, Logger } from '../misc/Logger.js';
import { sleep } from '../misc/sleep.js';
import type {
    BunDbAssignmentShape,
    BunDbClient,
    BunDbColumnName,
    BunDbDeleteConfig,
    BunDbDialect,
    BunDbInsert,
    BunDbInsertId,
    BunDbInsertOptions,
    BunDbReservedConnectionHandle,
    BunDbReservedConnectionClient,
    BunDbRuntimeSchemaMetadata,
    BunDbSchema,
    BunDbSqlExpression,
    BunDbSelectConfig,
    BunDbSelectResult,
    BunDbTableName,
    BunDbTransactionClient,
    BunDbUpdateConfig,
    BunDbWhereCondition,
    BunDbWriteResult
} from './bunDbTypes.js';

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_RETRY_DELAY_MS = 10000;

const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);

type BunRuntimeSqlQuery<T> = Promise<T> & {
    active?: boolean;
    cancelled?: boolean;
    cancel?: () => BunRuntimeSqlQuery<T>;
    execute?: () => BunRuntimeSqlQuery<T>;
    raw?: () => BunRuntimeSqlQuery<T>;
    simple?: () => BunRuntimeSqlQuery<T>;
    values?: () => BunRuntimeSqlQuery<T>;
};

type BunRuntimeSqlHelper<T> = {
    readonly value: T[];
    readonly columns: (keyof T)[];
};

type BunRuntimeSqlClient = {
    <T = unknown>(strings: TemplateStringsArray, ...values: readonly unknown[]): BunRuntimeSqlQuery<T>;
    <T = unknown>(queryString: string): BunRuntimeSqlQuery<T>;
    <T extends { [key: PropertyKey]: unknown }, Keys extends keyof T = keyof T>(
        obj: T | T[] | readonly T[],
        ...columns: readonly Keys[]
    ): BunRuntimeSqlHelper<Pick<T, Keys>>;
    <T>(value: T): BunRuntimeSqlHelper<T>;
    begin: <T>(fn: (sql: BunRuntimeTransactionSqlClient) => Promise<T> | T) => Promise<T>;
    close: (options?: { timeout?: number }) => Promise<void>;
    reserve: () => Promise<BunRuntimeReservedSqlClient>;
    unsafe: <T = unknown>(queryString: string, values?: readonly unknown[]) => BunRuntimeSqlQuery<T>;
    options?: {
        adapter?: 'postgres' | 'mysql' | 'mariadb' | 'sqlite';
    };
};

type BunRuntimeTransactionSqlClient = BunRuntimeSqlClient & {
    savepoint: <T>(fn: (sql: BunRuntimeTransactionSqlClient) => Promise<T> | T) => Promise<T>;
};

type BunRuntimeReservedSqlClient = BunRuntimeSqlClient & {
    release: () => void | Promise<void>;
};

type BunGlobalRuntime = {
    SQL: new (options?: Record<string, unknown> | string | URL, optionsOverride?: Record<string, unknown>) => BunRuntimeSqlClient;
};

type BunQueryContext = {
    sql: BunRuntimeSqlClient;
    allowRetries: boolean;
};

type BunWriteMetadata = {
    affectedRows?: number;
    lastInsertRowid?: string | number | bigint;
};

const pushValue = (values: unknown[], value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
};

const isSqlExpression = (value: unknown): value is BunDbSqlExpression =>
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'expression' &&
    'sql' in value &&
    typeof value.sql === 'string';

const renderAssignmentValue = (values: unknown[], value: unknown): string => {
    if (isSqlExpression(value)) {
        return value.sql;
    }

    return pushValue(values, value);
};

export interface DBBunConfig<Schema extends BunDbSchema = BunDbSchema> {
    url?: string;
    adapter?: BunDbDialect | 'mariadb';
    host?: string;
    hostname?: string;
    port?: number;
    user?: string;
    username?: string;
    password?: string | (() => Promise<string> | string);
    db?: string;
    database?: string;
    connectionLimit?: number;
    max?: number;
    idleTimeout?: number;
    connectionTimeout?: number;
    maxLifetime?: number;
    bigint?: boolean;
    prepare?: boolean;
    tls?: unknown;
    ssl?: unknown;
    logFolder?: string;
    maxRetries?: number;
    retryDelayMs?: number;
    schemaMetadata?: BunDbRuntimeSchemaMetadata<Schema>;
}

/**
 * Bun-native database helper that preserves the schema-driven typing model
 * while delegating connection pooling and transactions to Bun.SQL.
 */
export class DBBun<Schema extends BunDbSchema = BunDbSchema> implements BunDbClient<Schema> {
    private static readonly instances: Map<string, DBBun<any>> = new Map();
    private static readonly DEFAULT_KEY = 'default';
    private client: BunRuntimeSqlClient | undefined;
    private config: DBBunConfig<Schema>;
    private readonly logFolder: string;
    private readonly maxRetries: number;
    private readonly retryDelayMs: number;
    private readonly logger: Logger | null = null;
    private resetPromise: Promise<void> | null = null;

    private constructor(config: DBBunConfig<Schema>) {
        this.config = config;
        this.logFolder = config.logFolder ?? '';
        this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

        if (this.logFolder) {
            try {
                const logDir = path.dirname(this.logFolder);

                if (!existsSync(logDir)) {
                    mkdirSync(logDir, { recursive: true });
                }

                const verbose = process.argv.includes('--verbose');
                const debug = process.argv.includes('--debug');

                this.logger = Logger.getInstance({
                    logDir: this.logFolder,
                    verbose,
                    debug
                } satisfies LoggerConfig);
            } catch (error) {
                console.error('Failed to create log directory:', error);
            }
        }
    }

    public static getInstance<Schema extends BunDbSchema = BunDbSchema>(config?: DBBunConfig<Schema>, key?: string): DBBun<Schema> {
        const instanceKey = key || DBBun.DEFAULT_KEY;
        const instance = DBBun.instances.get(instanceKey);

        if (!instance) {
            if (!config) {
                throw new Error(`DBBun instance with key "${instanceKey}" not initialized. Please provide configuration.`);
            }

            const nextInstance = new DBBun<Schema>(config);
            DBBun.instances.set(instanceKey, nextInstance);
            return nextInstance;
        }

        if (config) {
            const previousConfig = instance.config;
            instance.config = config;

            if (instance.shouldResetClient(previousConfig, config)) {
                // eslint-disable-next-line no-void
                void instance.resetClient('config updated');
            }
        }

        return instance as DBBun<Schema>;
    }

    public static create<Schema extends BunDbSchema = BunDbSchema>(config: DBBunConfig<Schema>): DBBun<Schema> {
        return new DBBun<Schema>(config);
    }

    public static getInstanceKeys(): string[] {
        return Array.from(DBBun.instances.keys());
    }

    public get dialect(): BunDbDialect {
        return this.detectDialect(this.config);
    }

    async raw<TResult = unknown[]>(strings: TemplateStringsArray, ...values: readonly unknown[]): Promise<TResult> {
        const context = this.getRootContext();
        return this.executeTagged<TResult>(context, strings, values);
    }

    async unsafe<TResult = unknown>(queryString: string, values: readonly unknown[] = []): Promise<TResult> {
        const context = this.getRootContext();
        return this.executeUnsafe<TResult>(context, queryString, values);
    }

    async query<TResult = unknown>(queryString: string, values: readonly unknown[] = []): Promise<TResult> {
        return this.unsafe<TResult>(queryString, values);
    }

    async select<Table extends BunDbTableName<Schema>, Columns extends readonly BunDbColumnName<Schema, Table>[] | undefined = undefined>(
        table: Table,
        config?: BunDbSelectConfig<Schema, Table, Columns>
    ): Promise<BunDbSelectResult<Schema, Table, Columns>> {
        const context = this.getRootContext();
        return this.selectWithContext<Table, Columns>(context, table, config);
    }

    async selectOne<
        Table extends BunDbTableName<Schema>,
        Columns extends readonly BunDbColumnName<Schema, Table>[] | undefined = undefined
    >(
        table: Table,
        config?: BunDbSelectConfig<Schema, Table, Columns>
    ): Promise<BunDbSelectResult<Schema, Table, Columns>[number] | undefined> {
        const result = await this.select(table, {
            ...(config ?? {}),
            limit: config?.limit ?? 1
        } as BunDbSelectConfig<Schema, Table, Columns>);

        return result[0];
    }

    async insert<Table extends BunDbTableName<Schema>>(
        table: Table,
        values: BunDbInsert<Schema, Table>,
        options?: BunDbInsertOptions<Schema, Table>
    ): Promise<BunDbWriteResult<BunDbInsertId<Schema, Table>>> {
        const context = this.getRootContext();
        return this.insertManyWithContext<Table>(context, table, [values], options);
    }

    async insertMany<Table extends BunDbTableName<Schema>>(
        table: Table,
        values: readonly BunDbInsert<Schema, Table>[],
        options?: BunDbInsertOptions<Schema, Table>
    ): Promise<BunDbWriteResult<BunDbInsertId<Schema, Table>>> {
        const context = this.getRootContext();
        return this.insertManyWithContext<Table>(context, table, values, options);
    }

    async update<Table extends BunDbTableName<Schema>>(table: Table, config: BunDbUpdateConfig<Schema, Table>): Promise<BunDbWriteResult> {
        const context = this.getRootContext();
        return this.updateWithContext<Table>(context, table, config);
    }

    async delete<Table extends BunDbTableName<Schema>>(table: Table, config: BunDbDeleteConfig<Schema, Table>): Promise<BunDbWriteResult> {
        const context = this.getRootContext();
        return this.deleteWithContext<Table>(context, table, config);
    }

    async transaction<TResult>(callback: (tx: BunDbTransactionClient<Schema>) => Promise<TResult>): Promise<TResult> {
        const rootClient = this.getOrCreateClient();

        return rootClient.begin(async (sql) => callback(this.createTransactionClient(sql)));
    }

    async reserve<TResult>(callback: (connection: BunDbReservedConnectionClient<Schema>) => Promise<TResult>): Promise<TResult> {
        const reserved = await this.connectReserved();

        try {
            return await callback(reserved);
        } finally {
            await reserved.release();
        }
    }

    async connectReserved(): Promise<BunDbReservedConnectionHandle<Schema>> {
        const rootClient = this.getOrCreateClient();
        const reserved = await rootClient.reserve();
        return this.createReservedClient(reserved);
    }

    async close(): Promise<void> {
        if (!this.client) return;

        await this.client.close();
        this.client = undefined;
    }

    private createReservedClient(sql: BunRuntimeReservedSqlClient): BunDbReservedConnectionHandle<Schema> {
        const self = this;
        const context: BunQueryContext = { sql, allowRetries: false };
        let released = false;

        return {
            get dialect() {
                return self.dialect;
            },
            async raw<TResult = unknown[]>(strings: TemplateStringsArray, ...values: readonly unknown[]) {
                return self.executeTagged<TResult>(context, strings, values);
            },
            async unsafe<TResult = unknown>(queryString: string, values: readonly unknown[] = []) {
                return self.executeUnsafe<TResult>(context, queryString, values);
            },
            async query<TResult = unknown>(queryString: string, values: readonly unknown[] = []) {
                return self.executeUnsafe<TResult>(context, queryString, values);
            },
            async select<
                Table extends BunDbTableName<Schema>,
                Columns extends readonly BunDbColumnName<Schema, Table>[] | undefined = undefined
            >(table: Table, config?: BunDbSelectConfig<Schema, Table, Columns>) {
                return self.selectWithContext<Table, Columns>(context, table, config);
            },
            async selectOne<
                Table extends BunDbTableName<Schema>,
                Columns extends readonly BunDbColumnName<Schema, Table>[] | undefined = undefined
            >(table: Table, config?: BunDbSelectConfig<Schema, Table, Columns>) {
                const result = await self.selectWithContext<Table, Columns>(context, table, {
                    ...(config ?? {}),
                    limit: config?.limit ?? 1
                } as BunDbSelectConfig<Schema, Table, Columns>);

                return result[0];
            },
            async insert<Table extends BunDbTableName<Schema>>(
                table: Table,
                values: BunDbInsert<Schema, Table>,
                options?: BunDbInsertOptions<Schema, Table>
            ) {
                return self.insertManyWithContext<Table>(context, table, [values], options);
            },
            async insertMany<Table extends BunDbTableName<Schema>>(
                table: Table,
                values: readonly BunDbInsert<Schema, Table>[],
                options?: BunDbInsertOptions<Schema, Table>
            ) {
                return self.insertManyWithContext<Table>(context, table, values, options);
            },
            async update<Table extends BunDbTableName<Schema>>(table: Table, config: BunDbUpdateConfig<Schema, Table>) {
                return self.updateWithContext<Table>(context, table, config);
            },
            async delete<Table extends BunDbTableName<Schema>>(table: Table, config: BunDbDeleteConfig<Schema, Table>) {
                return self.deleteWithContext<Table>(context, table, config);
            },
            async transaction<TResult>(callback: (tx: BunDbTransactionClient<Schema>) => Promise<TResult>) {
                return sql.begin(async (tx) => callback(self.createTransactionClient(tx)));
            },
            async reserve<TResult>(callback: (connection: BunDbReservedConnectionClient<Schema>) => Promise<TResult>) {
                const nestedReserved = await sql.reserve();
                const reservedClient = self.createReservedClient(nestedReserved);

                try {
                    return await callback(reservedClient);
                } finally {
                    await reservedClient.release();
                }
            },
            async release() {
                if (released) {
                    return;
                }

                released = true;
                await Promise.resolve(sql.release());
            }
        };
    }

    private createTransactionClient(sql: BunRuntimeTransactionSqlClient): BunDbTransactionClient<Schema> {
        const self = this;
        const context: BunQueryContext = { sql, allowRetries: false };

        return {
            get dialect() {
                return self.dialect;
            },
            async raw<TResult = unknown[]>(strings: TemplateStringsArray, ...values: readonly unknown[]) {
                return self.executeTagged<TResult>(context, strings, values);
            },
            async unsafe<TResult = unknown>(queryString: string, values: readonly unknown[] = []) {
                return self.executeUnsafe<TResult>(context, queryString, values);
            },
            async query<TResult = unknown>(queryString: string, values: readonly unknown[] = []) {
                return self.executeUnsafe<TResult>(context, queryString, values);
            },
            async select<
                Table extends BunDbTableName<Schema>,
                Columns extends readonly BunDbColumnName<Schema, Table>[] | undefined = undefined
            >(table: Table, config?: BunDbSelectConfig<Schema, Table, Columns>) {
                return self.selectWithContext<Table, Columns>(context, table, config);
            },
            async selectOne<
                Table extends BunDbTableName<Schema>,
                Columns extends readonly BunDbColumnName<Schema, Table>[] | undefined = undefined
            >(table: Table, config?: BunDbSelectConfig<Schema, Table, Columns>) {
                const result = await self.selectWithContext<Table, Columns>(context, table, {
                    ...(config ?? {}),
                    limit: config?.limit ?? 1
                } as BunDbSelectConfig<Schema, Table, Columns>);

                return result[0];
            },
            async insert<Table extends BunDbTableName<Schema>>(
                table: Table,
                values: BunDbInsert<Schema, Table>,
                options?: BunDbInsertOptions<Schema, Table>
            ) {
                return self.insertManyWithContext<Table>(context, table, [values], options);
            },
            async insertMany<Table extends BunDbTableName<Schema>>(
                table: Table,
                values: readonly BunDbInsert<Schema, Table>[],
                options?: BunDbInsertOptions<Schema, Table>
            ) {
                return self.insertManyWithContext<Table>(context, table, values, options);
            },
            async update<Table extends BunDbTableName<Schema>>(table: Table, config: BunDbUpdateConfig<Schema, Table>) {
                return self.updateWithContext<Table>(context, table, config);
            },
            async delete<Table extends BunDbTableName<Schema>>(table: Table, config: BunDbDeleteConfig<Schema, Table>) {
                return self.deleteWithContext<Table>(context, table, config);
            },
            async transaction<TResult>(callback: (tx: BunDbTransactionClient<Schema>) => Promise<TResult>) {
                return sql.begin(async (tx) => callback(self.createTransactionClient(tx)));
            },
            async savepoint<TResult>(callback: (tx: BunDbTransactionClient<Schema>) => Promise<TResult>) {
                return sql.savepoint(async (savepointSql) => callback(self.createTransactionClient(savepointSql)));
            }
        };
    }

    private async selectWithContext<
        Table extends BunDbTableName<Schema>,
        Columns extends readonly BunDbColumnName<Schema, Table>[] | undefined = undefined
    >(
        context: BunQueryContext,
        table: Table,
        config?: BunDbSelectConfig<Schema, Table, Columns>
    ): Promise<BunDbSelectResult<Schema, Table, Columns>> {
        const { queryString, parameters } = this.buildSelectQuery(table, config);
        const rows = await this.executeUnsafe<BunDbSelectResult<Schema, Table, Columns>>(context, queryString, parameters);
        return rows;
    }

    private async insertManyWithContext<Table extends BunDbTableName<Schema>>(
        context: BunQueryContext,
        table: Table,
        values: readonly BunDbInsert<Schema, Table>[],
        options?: BunDbInsertOptions<Schema, Table>
    ): Promise<BunDbWriteResult<BunDbInsertId<Schema, Table>>> {
        if (values.length === 0) {
            return { affectedRows: 0 };
        }

        const columns = Array.from(new Set(values.flatMap((row) => Object.keys(row).filter((column) => hasOwn(row, column)))));

        if (columns.length === 0) {
            throw new Error(`Cannot insert into "${String(table)}" with an empty values object.`);
        }

        const parameters: unknown[] = [];
        const rowValueGroups: string[] = [];

        for (const row of values) {
            const placeholders = columns
                .map((column) => (hasOwn(row, column) ? pushValue(parameters, (row as Record<string, unknown>)[column]) : 'DEFAULT'))
                .join(', ');

            rowValueGroups.push(`(${placeholders})`);
        }

        const tableIdentifier = this.quoteIdentifier(String(table));
        const columnIdentifiers = columns.map((column) => this.quoteIdentifier(column)).join(', ');
        let queryString = `INSERT INTO ${tableIdentifier} (${columnIdentifiers}) VALUES ${rowValueGroups.join(', ')}`;
        const singlePrimaryKey = this.getSinglePrimaryKeyColumn(table);

        if (options?.ignore && options.upsert) {
            throw new Error(`Cannot combine ignore and upsert options for table "${String(table)}".`);
        }

        if (this.dialect === 'postgres') {
            if (options?.upsert) {
                const conflictColumns = this.getPostgresConflictColumns(table, options);
                const updateColumns = this.getPostgresUpsertColumns(table, columns, options);

                const updateEntries = new Map<string, string>(
                    updateColumns.map((column) => [column, `${this.quoteIdentifier(column)} = EXCLUDED.${this.quoteIdentifier(column)}`])
                );

                for (const [column, value] of Object.entries(options.upsert.update ?? {})) {
                    if (value === undefined) {
                        continue;
                    }

                    updateEntries.set(column, `${this.quoteIdentifier(column)} = ${renderAssignmentValue(parameters, value)}`);
                }

                if (updateEntries.size === 0) {
                    queryString += ` ON CONFLICT (${conflictColumns.map((column) => this.quoteIdentifier(column)).join(', ')}) DO NOTHING`;
                } else {
                    queryString += ` ON CONFLICT (${conflictColumns.map((column) => this.quoteIdentifier(column)).join(', ')}) DO UPDATE SET ${[
                        ...updateEntries.values()
                    ].join(', ')}`;
                }
            } else if (options?.ignore) {
                queryString += ` ON CONFLICT DO NOTHING`;
            }

            if (singlePrimaryKey) {
                queryString += ` RETURNING ${this.quoteIdentifier(singlePrimaryKey)} AS "__insert_id"`;

                const rows = await this.executeUnsafe<{ __insert_id: BunDbInsertId<Schema, Table> }[]>(context, queryString, parameters);

                const insertId = rows.length > 0 ? rows[rows.length - 1]?.__insert_id : undefined;

                return {
                    affectedRows: rows.length,
                    ...(insertId !== undefined ? { insertId } : {})
                };
            }

            queryString += ` RETURNING 1 AS "__affected"`;
            const rows = await this.executeUnsafe<{ __affected: 1 }[]>(context, queryString, parameters);

            return {
                affectedRows: rows.length
            };
        }

        if (options?.ignore) {
            queryString = queryString.replace('INSERT INTO', 'INSERT IGNORE INTO');
        }

        if (options?.upsert) {
            const updateColumns = this.getMysqlUpsertColumns(table, columns, options);

            const updateEntries = new Map<string, string>(
                updateColumns.map((column) => [column, `${this.quoteIdentifier(column)} = VALUES(${this.quoteIdentifier(column)})`])
            );

            for (const [column, value] of Object.entries(options.upsert.update ?? {})) {
                if (value === undefined) {
                    continue;
                }

                updateEntries.set(column, `${this.quoteIdentifier(column)} = ${renderAssignmentValue(parameters, value)}`);
            }

            if (updateEntries.size > 0) {
                queryString += ` ON DUPLICATE KEY UPDATE ${[...updateEntries.values()].join(', ')}`;
            }
        }

        const result = await this.executeUnsafe<BunWriteMetadata>(context, queryString, parameters);
        const insertId = result.lastInsertRowid as BunDbInsertId<Schema, Table> | undefined;
        return {
            affectedRows: result.affectedRows ?? 0,
            ...(insertId !== undefined ? { insertId } : {})
        };
    }

    private async updateWithContext<Table extends BunDbTableName<Schema>>(
        context: BunQueryContext,
        table: Table,
        config: BunDbUpdateConfig<Schema, Table>
    ): Promise<BunDbWriteResult> {
        const setEntries = Object.entries(config.set as BunDbAssignmentShape<Schema, Table>).filter(([, value]) => value !== undefined);

        if (setEntries.length === 0) {
            throw new Error(`No columns provided for update on table "${String(table)}".`);
        }

        const parameters: unknown[] = [];

        const setClause = setEntries
            .map(([column, value]) => `${this.quoteIdentifier(column)} = ${renderAssignmentValue(parameters, value)}`)
            .join(', ');

        const tableIdentifier = this.quoteIdentifier(String(table));
        let queryString = `UPDATE ${tableIdentifier} SET ${setClause}`;
        let parameterIndex = parameters.length + 1;

        if (config.where) {
            const whereConditions = Array.isArray(config.where) ? config.where : [config.where];

            if (whereConditions.length > 0) {
                const { clause, values, nextParamIndex } = this.buildWhereClause(
                    table,
                    whereConditions,
                    config.whereOperator ?? 'AND',
                    parameterIndex
                );

                queryString += ` WHERE ${clause}`;
                parameters.push(...values);
                parameterIndex = nextParamIndex;
            } else if (!config.allowFullTableUpdate) {
                throw new Error(`No WHERE conditions provided for update on table "${String(table)}".`);
            }
        } else if (!config.allowFullTableUpdate) {
            throw new Error(`No WHERE conditions provided for update on table "${String(table)}".`);
        }

        if (this.dialect === 'postgres') {
            queryString += ` RETURNING 1 AS "__affected"`;
            const rows = await this.executeUnsafe<{ __affected: 1 }[]>(context, queryString, parameters);
            return { affectedRows: rows.length };
        }

        const result = await this.executeUnsafe<BunWriteMetadata>(context, queryString, parameters);
        return { affectedRows: result.affectedRows ?? 0 };
    }

    private async deleteWithContext<Table extends BunDbTableName<Schema>>(
        context: BunQueryContext,
        table: Table,
        config: BunDbDeleteConfig<Schema, Table>
    ): Promise<BunDbWriteResult> {
        const parameters: unknown[] = [];
        const tableIdentifier = this.quoteIdentifier(String(table));
        let queryString = `DELETE FROM ${tableIdentifier}`;

        if (config.where) {
            const whereConditions = Array.isArray(config.where) ? config.where : [config.where];

            if (whereConditions.length > 0) {
                const { clause, values } = this.buildWhereClause(table, whereConditions, config.whereOperator ?? 'AND');
                queryString += ` WHERE ${clause}`;
                parameters.push(...values);
            } else if (!config.allowFullTableDelete) {
                throw new Error(`No WHERE conditions provided for delete on table "${String(table)}".`);
            }
        } else if (!config.allowFullTableDelete) {
            throw new Error(`No WHERE conditions provided for delete on table "${String(table)}".`);
        }

        if (this.dialect === 'postgres') {
            queryString += ` RETURNING 1 AS "__affected"`;
            const rows = await this.executeUnsafe<{ __affected: 1 }[]>(context, queryString, parameters);
            return { affectedRows: rows.length };
        }

        const result = await this.executeUnsafe<BunWriteMetadata>(context, queryString, parameters);
        return { affectedRows: result.affectedRows ?? 0 };
    }

    private buildSelectQuery<Table extends BunDbTableName<Schema>, Columns extends readonly BunDbColumnName<Schema, Table>[] | undefined>(
        table: Table,
        config?: BunDbSelectConfig<Schema, Table, Columns>
    ): {
        queryString: string;
        parameters: unknown[];
    } {
        const selectedColumns =
            config?.columns && config.columns.length > 0
                ? config.columns.map((column) => this.quoteIdentifier(String(column))).join(', ')
                : '*';

        const tableIdentifier = this.quoteIdentifier(String(table));
        let queryString = `SELECT ${selectedColumns} FROM ${tableIdentifier}`;
        const parameters: unknown[] = [];
        let parameterIndex = 1;

        if (config?.where) {
            const whereConditions = Array.isArray(config.where) ? config.where : [config.where];

            if (whereConditions.length > 0) {
                const { clause, values, nextParamIndex } = this.buildWhereClause(
                    table,
                    whereConditions,
                    config.whereOperator ?? 'AND',
                    parameterIndex
                );

                queryString += ` WHERE ${clause}`;
                parameters.push(...values);
                parameterIndex = nextParamIndex;
            }
        }

        if (config?.orderBy) {
            const orderByArray = Array.isArray(config.orderBy) ? config.orderBy : [config.orderBy];

            if (orderByArray.length > 0) {
                queryString += ` ORDER BY ${orderByArray
                    .map((orderBy) => `${this.quoteIdentifier(String(orderBy.column))} ${orderBy.direction ?? 'ASC'}`)
                    .join(', ')}`;
            }
        }

        if (typeof config?.limit === 'number') {
            queryString += ` LIMIT $${parameterIndex++}`;
            parameters.push(config.limit);
        }

        if (typeof config?.offset === 'number') {
            queryString += ` OFFSET $${parameterIndex++}`;
            parameters.push(config.offset);
        }

        if (config?.forUpdate) {
            queryString += ' FOR UPDATE';
        }

        return { queryString, parameters };
    }

    private buildWhereClause<Table extends BunDbTableName<Schema>>(
        table: Table,
        conditions: readonly BunDbWhereCondition<Schema, Table>[],
        joinOperator: 'AND' | 'OR',
        startParamIndex: number = 1
    ): {
        clause: string;
        values: unknown[];
        nextParamIndex: number;
    } {
        const values: unknown[] = [];
        const parts: string[] = [];
        let parameterIndex = startParamIndex;

        for (const condition of conditions) {
            if ('group' in condition) {
                const grouped = this.buildWhereClause(table, condition.group, condition.operator ?? 'AND', parameterIndex);
                parts.push(`(${grouped.clause})`);
                values.push(...grouped.values);
                parameterIndex = grouped.nextParamIndex;
                continue;
            }

            const column = this.quoteIdentifier(String(condition.column));
            const operator = condition.operator ?? '=';
            const upperOperator = operator.toUpperCase();
            const value = condition.value as unknown;

            if (value === null) {
                const nullOperator = upperOperator === '!=' || upperOperator === '<>' ? 'IS NOT' : upperOperator === '=' ? 'IS' : operator;
                parts.push(`${column} ${nullOperator} NULL`);
                continue;
            }

            if (upperOperator === 'IN' || upperOperator === 'NOT IN') {
                if (!Array.isArray(value) || value.length === 0) {
                    throw new Error(`Operator ${operator} requires a non-empty array value for column "${String(condition.column)}".`);
                }

                const placeholders = value.map(() => `$${parameterIndex++}`);
                parts.push(`${column} ${upperOperator} (${placeholders.join(', ')})`);
                values.push(...value);
                continue;
            }

            if (upperOperator === 'BETWEEN' || upperOperator === 'NOT BETWEEN') {
                if (!Array.isArray(value) || value.length !== 2) {
                    throw new Error(
                        `Operator ${operator} requires an array of exactly two values for column "${String(condition.column)}".`
                    );
                }

                parts.push(`${column} ${upperOperator} $${parameterIndex} AND $${parameterIndex + 1}`);
                values.push(value[0], value[1]);
                parameterIndex += 2;
                continue;
            }

            parts.push(`${column} ${operator} $${parameterIndex}`);
            values.push(value);
            parameterIndex++;
        }

        return {
            clause: parts.join(` ${joinOperator} `),
            values,
            nextParamIndex: parameterIndex
        };
    }

    private quoteIdentifier(identifier: string): string {
        const quote = this.dialect === 'mysql' ? '`' : '"';

        const escapedIdentifier = identifier
            .split('.')
            .map((part) => `${quote}${part.replaceAll(quote, quote + quote)}${quote}`)
            .join('.');

        return escapedIdentifier;
    }

    private getPostgresConflictColumns<Table extends BunDbTableName<Schema>>(
        table: Table,
        options: BunDbInsertOptions<Schema, Table>
    ): string[] {
        const explicitTarget = options.upsert?.conflictTarget?.map((column) => String(column));
        if (explicitTarget && explicitTarget.length > 0) return explicitTarget;

        const primaryKey = this.getPrimaryKeyColumns(table);
        if (primaryKey.length > 0) return primaryKey;

        throw new Error(`Postgres upsert for table "${String(table)}" requires conflictTarget or generated primaryKey metadata.`);
    }

    private getPostgresUpsertColumns<Table extends BunDbTableName<Schema>>(
        table: Table,
        insertColumns: string[],
        options: BunDbInsertOptions<Schema, Table>
    ): string[] {
        const explicitColumns = options.upsert?.updateColumns?.map((column) => String(column));
        if (explicitColumns && explicitColumns.length > 0) return explicitColumns;

        const conflictColumns = new Set(this.getPostgresConflictColumns(table, options));
        return insertColumns.filter((column) => !conflictColumns.has(column));
    }

    private getMysqlUpsertColumns<Table extends BunDbTableName<Schema>>(
        _table: Table,
        insertColumns: string[],
        options: BunDbInsertOptions<Schema, Table>
    ): string[] {
        const explicitColumns = options.upsert?.updateColumns?.map((column) => String(column));
        if (explicitColumns && explicitColumns.length > 0) return explicitColumns;
        return insertColumns;
    }

    private getPrimaryKeyColumns<Table extends BunDbTableName<Schema>>(table: Table): string[] {
        const primaryKey = this.config.schemaMetadata?.[table]?.primaryKey;

        if (!primaryKey) return [];
        return Array.isArray(primaryKey) ? primaryKey.map((column) => String(column)) : [String(primaryKey)];
    }

    private getSinglePrimaryKeyColumn<Table extends BunDbTableName<Schema>>(table: Table): string | undefined {
        const primaryKey = this.getPrimaryKeyColumns(table);
        return primaryKey.length === 1 ? primaryKey[0] : undefined;
    }

    private async executeTagged<TResult>(
        context: BunQueryContext,
        strings: TemplateStringsArray,
        values: readonly unknown[]
    ): Promise<TResult> {
        return this.executeWithRetry(context, async (activeContext) => activeContext.sql<TResult>(strings, ...values));
    }

    private async executeUnsafe<TResult>(context: BunQueryContext, queryString: string, values: readonly unknown[]): Promise<TResult> {
        return this.executeWithRetry(context, async (activeContext) => activeContext.sql.unsafe<TResult>(queryString, [...values]));
    }

    private async executeWithRetry<TResult>(
        context: BunQueryContext,
        operation: (context: BunQueryContext) => Promise<TResult>
    ): Promise<TResult> {
        let retryAttempts = 0;
        let activeContext = context;

        while (retryAttempts < this.maxRetries) {
            try {
                return await operation(activeContext);
            } catch (error) {
                if (!activeContext.allowRetries) {
                    this.handleError(error);
                    throw error;
                }

                if (this.isClosedClientError(error)) {
                    await this.resetClient('client closed');
                } else if (this.isTransientError(error) && retryAttempts < this.maxRetries - 1) {
                    await sleep(this.retryDelayMs * (retryAttempts + 1));
                } else {
                    this.handleError(error);
                    throw error;
                }

                retryAttempts++;
                activeContext = this.getRootContext();
            }
        }

        throw new Error(`Max retries (${this.maxRetries}) reached for Bun SQL operation.`);
    }

    private getRootContext(): BunQueryContext {
        return {
            sql: this.getOrCreateClient(),
            allowRetries: true
        };
    }

    private getOrCreateClient(): BunRuntimeSqlClient {
        if (this.client) return this.client;

        const bunGlobal = this.getBunGlobal();
        this.client = new bunGlobal.SQL(this.buildClientOptions());
        return this.client;
    }

    private buildClientOptions(): Record<string, unknown> {
        const options: Record<string, unknown> = {};

        if (this.config.url) options.url = this.config.url;
        if (this.config.adapter) options.adapter = this.config.adapter;
        if (this.config.hostname ?? this.config.host) options.hostname = this.config.hostname ?? this.config.host;
        if (this.config.port !== undefined) options.port = this.config.port;
        if (this.config.username ?? this.config.user) options.username = this.config.username ?? this.config.user;
        if (this.config.password !== undefined) options.password = this.config.password;
        if (this.config.database ?? this.config.db) options.database = this.config.database ?? this.config.db;
        if (this.config.max ?? this.config.connectionLimit) options.max = this.config.max ?? this.config.connectionLimit;
        if (this.config.idleTimeout !== undefined) options.idleTimeout = this.config.idleTimeout;
        if (this.config.connectionTimeout !== undefined) options.connectionTimeout = this.config.connectionTimeout;
        if (this.config.maxLifetime !== undefined) options.maxLifetime = this.config.maxLifetime;
        if (this.config.bigint !== undefined) options.bigint = this.config.bigint;
        if (this.config.prepare !== undefined) options.prepare = this.config.prepare;
        if (this.config.tls !== undefined) options.tls = this.config.tls;
        if (this.config.ssl !== undefined) options.ssl = this.config.ssl;

        return options;
    }

    private getBunGlobal(): BunGlobalRuntime {
        const runtime = globalThis as typeof globalThis & { Bun?: BunGlobalRuntime };
        const bunGlobal = runtime.Bun;

        if (!bunGlobal?.SQL) {
            throw new Error('DBBun requires the Bun runtime. Bun.SQL is not available in this process.');
        }

        return bunGlobal;
    }

    private shouldResetClient(previousConfig: DBBunConfig<Schema>, nextConfig: DBBunConfig<Schema>): boolean {
        return (
            previousConfig.url !== nextConfig.url ||
            previousConfig.adapter !== nextConfig.adapter ||
            previousConfig.host !== nextConfig.host ||
            previousConfig.hostname !== nextConfig.hostname ||
            previousConfig.port !== nextConfig.port ||
            previousConfig.user !== nextConfig.user ||
            previousConfig.username !== nextConfig.username ||
            previousConfig.password !== nextConfig.password ||
            previousConfig.db !== nextConfig.db ||
            previousConfig.database !== nextConfig.database ||
            previousConfig.connectionLimit !== nextConfig.connectionLimit ||
            previousConfig.max !== nextConfig.max ||
            previousConfig.tls !== nextConfig.tls ||
            previousConfig.ssl !== nextConfig.ssl ||
            previousConfig.schemaMetadata !== nextConfig.schemaMetadata
        );
    }

    private async resetClient(reason: string): Promise<void> {
        if (this.resetPromise) return this.resetPromise;

        this.resetPromise = Promise.resolve()
            .then(async () => {
                const previousClient = this.client;
                this.client = undefined;

                if (previousClient) {
                    await previousClient.close().catch((error: unknown) => {
                        this.handleError(error);
                    });
                }

                if (reason) {
                    console.warn(`Bun SQL client reset: ${reason}`);
                }
            })
            .finally(() => {
                this.resetPromise = null;
            });

        return this.resetPromise;
    }

    private detectDialect(config: DBBunConfig<Schema>): BunDbDialect {
        const adapter = config.adapter?.toLowerCase();
        if (adapter === 'mysql' || adapter === 'mariadb') return 'mysql';
        if (adapter === 'postgres') return 'postgres';

        const url = config.url?.toLowerCase();

        if (url?.startsWith('mysql://') || url?.startsWith('mysql2://') || url?.startsWith('mariadb://')) {
            return 'mysql';
        }

        return 'postgres';
    }

    private isClosedClientError(error: unknown): boolean {
        if (!(error instanceof Error)) return false;
        const message = error.message.toLowerCase();

        return (
            message.includes('closed') ||
            message.includes('connection terminated unexpectedly') ||
            message.includes('server closed the connection unexpectedly')
        );
    }

    private isTransientError(error: unknown): boolean {
        const dbError = error as { code?: string; message?: string };
        const { code } = dbError;

        if (!code) return false;

        const transientCodes = [
            'ECONNRESET',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'EPIPE',
            'ENETUNREACH',
            'EHOSTUNREACH',
            'ENETDOWN',
            'ENOTFOUND',
            'EAI_AGAIN',
            '57P01',
            '57P02',
            '57P03',
            '53300',
            '08006',
            '08003',
            '08001',
            '40001',
            '40P01',
            'ER_LOCK_DEADLOCK',
            'ER_LOCK_WAIT_TIMEOUT',
            'PROTOCOL_CONNECTION_LOST'
        ];

        return transientCodes.includes(code);
    }

    private handleError(error: unknown): void {
        if (this.logger) {
            try {
                if (error instanceof Error) {
                    const argString = process.argv.slice(1).join(' ');

                    const logEntry = `${argString}\nError Stack: ${error.stack ?? ''}\n Datetime: ${getDate({ format: 'ymdhms' })}\n${JSON.stringify(
                        error,
                        null,
                        4
                    )}`;

                    this.logger.log({
                        level: 'error',
                        severity: 8,
                        message: logEntry,
                        error
                    });

                    return;
                }
            } catch (logError) {
                console.error('Failed to write to Bun SQL log file:', logError);
            }
        }

        console.error('Bun SQL error:', error instanceof Error ? error.message : error);
    }
}
