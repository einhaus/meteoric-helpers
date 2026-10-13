import mysql, { type FieldPacket, type PoolConnection, type RowDataPacket } from 'mysql2';
import { DatabaseMcpError, type DatabaseMcpLimits, type DatabaseMcpProfile } from './config.js';
import type { CompiledDatabaseQuery } from './query.js';

export interface DatabaseMcpColumn {
    name: string;
    type: string;
    nullable: boolean;
}
export interface DatabaseMcpQueryResult {
    columns: string[];
    rows: unknown[][];
    truncated: boolean;
}
function deniedGrants(): never {
    throw new DatabaseMcpError(
        'denied',
        'Database account must have only the configured column-level SELECT grants, or SELECT on explicitly approved views. Roles and grant options are not allowed.'
    );
}

/** SHOW GRANTS includes routine and role grants that INFORMATION_SCHEMA privilege tables can miss. Never log it. */
export function assertDatabaseMcpGrants(grants: string[], profile: DatabaseMcpProfile): void {
    if (!grants.length) deniedGrants();
    for (const grant of grants) {
        if (/\bWITH GRANT OPTION\b/i.test(grant)) deniedGrants();
        if (/^GRANT USAGE ON \*\.\* TO /i.test(grant)) continue;
        const match = /^GRANT SELECT(?: \(([^)]+)\))? ON `([A-Za-z_][A-Za-z0-9_]*)`\.`([A-Za-z_][A-Za-z0-9_]*)` TO /i.exec(grant);
        if (!match || match[2] !== profile.connection.database) deniedGrants();
        const table = match[3] ?? '';
        const policy = Object.hasOwn(profile.tables, table) ? profile.tables[table] : undefined;
        if (!policy) deniedGrants();
        if (!match[1]) {
            if (policy.kind !== 'view') deniedGrants();
        } else {
            const columns = match[1].split(',').map((part) => /^\s*`([A-Za-z_][A-Za-z0-9_]*)`\s*$/.exec(part)?.[1]);
            if (columns.some((column) => !column || !policy.columns.includes(column))) deniedGrants();
        }
    }
}

export class MariaDbMcpReader {
    private readonly pool;
    private readonly columns = new Map<string, DatabaseMcpColumn[]>();
    private closed = false;

    constructor(
        private readonly profile: DatabaseMcpProfile,
        private readonly limits: DatabaseMcpLimits
    ) {
        const connection = profile.connection;
        this.pool = mysql.createPool({
            host: connection.host,
            port: connection.port,
            database: connection.database,
            user: connection.user,
            password: connection.password,
            ...(connection.tls ? { ssl: { rejectUnauthorized: true, ...(connection.tls.ca ? { ca: connection.tls.ca } : {}) } } : {}),
            connectionLimit: limits.maxConcurrentQueries,
            waitForConnections: false,
            connectTimeout: 5000,
            multipleStatements: false,
            supportBigNumbers: true,
            bigNumberStrings: true,
            dateStrings: true,
            jsonStrings: true,
            timezone: 'Z'
        });
    }

    private acquire(): Promise<PoolConnection> {
        if (this.closed) return Promise.reject(new DatabaseMcpError('unavailable', 'Database reader is closed.'));
        return new Promise((resolve, reject) => {
            this.pool.getConnection((error, connection) => {
                if (error) reject(new DatabaseMcpError('unavailable', 'Database connection unavailable.'));
                else resolve(connection);
            });
        });
    }

    private async verify(connection: PoolConnection): Promise<void> {
        const [rows] = await connection
            .promise()
            .query<RowDataPacket[]>({ sql: 'SHOW GRANTS FOR CURRENT_USER', timeout: this.limits.queryTimeoutMs });
        assertDatabaseMcpGrants(
            rows.map((row) => String(Object.values(row)[0])),
            this.profile
        );
    }

    async initialize(): Promise<void> {
        const connection = await this.acquire();
        try {
            await this.verify(connection);
            const [versions] = await connection
                .promise()
                .query<RowDataPacket[]>({ sql: 'SELECT VERSION() AS version', timeout: this.limits.queryTimeoutMs });
            if (!String(versions[0]?.version).includes('MariaDB')) throw new DatabaseMcpError('denied', 'This adapter requires MariaDB.');
            for (const [table, policy] of Object.entries(this.profile.tables)) {
                const [metadata] = await connection.promise().execute<RowDataPacket[]>(
                    {
                        sql: 'SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, t.TABLE_TYPE FROM information_schema.COLUMNS c JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME WHERE c.TABLE_SCHEMA = ? AND c.TABLE_NAME = ? ORDER BY c.ORDINAL_POSITION',
                        timeout: this.limits.queryTimeoutMs
                    },
                    [this.profile.connection.database, table]
                );
                const actual = metadata.map((column) => String(column.COLUMN_NAME));
                if (
                    policy.columns.some((column) => !actual.includes(column)) ||
                    !metadata.length ||
                    (metadata[0]?.TABLE_TYPE === 'VIEW') !== (policy.kind === 'view') ||
                    (policy.kind === 'view' && actual.some((column) => !policy.columns.includes(column)))
                ) {
                    throw new DatabaseMcpError('denied', 'Configured schema does not match the database grants or view columns.');
                }
                this.columns.set(
                    table,
                    metadata
                        .filter((column) => policy.columns.includes(String(column.COLUMN_NAME)))
                        .map((column) => ({
                            name: String(column.COLUMN_NAME),
                            type: String(column.DATA_TYPE),
                            nullable: column.IS_NULLABLE === 'YES'
                        }))
                );
            }
        } catch (error) {
            if (error instanceof DatabaseMcpError) throw error;
            throw new DatabaseMcpError('unavailable', 'Database preflight failed. Check the dedicated account and schema.');
        } finally {
            connection.release();
        }
    }

    describe(table: string): DatabaseMcpColumn[] {
        const columns = this.columns.get(table);
        if (!columns) throw new DatabaseMcpError('denied', 'Table is not approved.');
        return columns;
    }

    async query(
        compiled: CompiledDatabaseQuery,
        signal: AbortSignal,
        redact: (value: unknown, key?: string) => unknown
    ): Promise<DatabaseMcpQueryResult> {
        signal.throwIfAborted();
        const connection = await this.acquire();
        let destroyed = false;
        const destroy = (): void => {
            destroyed = true;
            connection.destroy();
        };
        const timer = setTimeout(destroy, this.limits.queryTimeoutMs + 1000);
        signal.addEventListener('abort', destroy, { once: true });
        try {
            if (signal.aborted) {
                destroy();
                throw new DatabaseMcpError('cancelled', 'Query cancelled.');
            }
            await this.verify(connection);
            await connection.promise().query('SET SESSION max_statement_time = ?', [this.limits.queryTimeoutMs / 1000]);
            await connection.promise().query('START TRANSACTION READ ONLY');
            const result: DatabaseMcpQueryResult = { columns: [], rows: [], truncated: false };
            const execution = connection.execute({
                sql: compiled.sql,
                values: compiled.parameters,
                rowsAsArray: true,
                timeout: this.limits.queryTimeoutMs + 1000
            });
            execution.on('fields', (fields: FieldPacket[]) => {
                result.columns = fields.map((field) => field.name);
            });
            const stream = execution.stream({ highWaterMark: 1 });
            let bytes = 0;
            for await (const raw of stream) {
                if (destroyed || signal.aborted) throw new DatabaseMcpError('cancelled', 'Query cancelled or timed out.');
                if (!Array.isArray(raw)) throw new DatabaseMcpError('query_failed', 'Unexpected database result.');
                const row = (raw as unknown[]).map((cell, index) => redact(cell, result.columns[index]));
                // Tool text is JSON inside a JSON-RPC result: budget the escaped representation too.
                const rowBytes = Buffer.byteLength(JSON.stringify(JSON.stringify(row))) + 1;
                if (result.rows.length >= compiled.rowLimit || bytes + rowBytes > this.limits.maxBytes - 8192) {
                    result.truncated = true;
                    destroy();
                    break;
                }
                bytes += rowBytes;
                result.rows.push(row);
            }
            if (!destroyed) await connection.promise().query('ROLLBACK');
            return result;
        } catch (error) {
            destroy();
            if (error instanceof DatabaseMcpError) throw error;
            throw new DatabaseMcpError(
                signal.aborted ? 'cancelled' : 'query_failed',
                'Query failed, exceeded its limits, or was cancelled. Database details are withheld.'
            );
        } finally {
            clearTimeout(timer);
            signal.removeEventListener('abort', destroy);
            if (!destroyed) connection.release();
        }
    }

    async close(): Promise<void> {
        this.closed = true;
        await this.pool.promise().end();
    }
}
