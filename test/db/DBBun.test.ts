import { afterEach, describe, expect, it, vi } from 'vitest';
import { bunDbExpr, type BunDbSchemaTable } from '../../src/db/bunDbTypes.js';
import { DBBun } from '../../src/db/bun.js';

type MockRuntimeSqlClient = {
    unsafe: (queryString: string, values?: readonly unknown[]) => Promise<unknown>;
    begin: <T>(fn: (sql: MockRuntimeTransactionSqlClient) => Promise<T> | T) => Promise<T>;
    close: () => Promise<void>;
    reserve: () => Promise<MockRuntimeReservedSqlClient>;
    options?: {
        adapter?: 'postgres' | 'mysql' | 'mariadb' | 'sqlite';
    };
};

type MockRuntimeTransactionSqlClient = MockRuntimeSqlClient & {
    savepoint: <T>(fn: (sql: MockRuntimeTransactionSqlClient) => Promise<T> | T) => Promise<T>;
};

type MockRuntimeReservedSqlClient = MockRuntimeSqlClient & {
    release: () => Promise<void> | void;
};

type MockBunGlobal = {
    SQL: new (options?: Record<string, unknown> | string | URL, optionsOverride?: Record<string, unknown>) => MockRuntimeSqlClient;
};

interface TestSchema {
    users: BunDbSchemaTable<
        {
            id: number;
            email: string;
            login_count: number;
            created_at: Date;
            updated_at: Date | null;
        },
        {
            id?: number;
            email: string;
            login_count?: number;
            created_at?: Date;
            updated_at?: Date | null;
        },
        {
            email?: string;
            login_count?: number;
            updated_at?: Date | null;
        },
        'id'
    >;
}

describe('DBBun raw SQL helpers', () => {
    const runtime = globalThis as typeof globalThis & { Bun?: MockBunGlobal };
    const originalBun = runtime.Bun;
    const originalSqlDescriptor = originalBun ? Object.getOwnPropertyDescriptor(originalBun, 'SQL') : undefined;
    const openDbs: Array<DBBun> = [];

    afterEach(async () => {
        while (openDbs.length > 0) {
            const db = openDbs.pop();

            if (db) {
                await db.close();
            }
        }

        if (originalBun) {
            if (originalSqlDescriptor) {
                Object.defineProperty(originalBun, 'SQL', originalSqlDescriptor);
            } else {
                Reflect.deleteProperty(originalBun, 'SQL');
            }

            runtime.Bun = originalBun;
        } else {
            Reflect.deleteProperty(runtime, 'Bun');
        }

        vi.restoreAllMocks();
    });

    function installMockSql(MockSQL: MockBunGlobal['SQL']): void {
        if (!runtime.Bun) {
            Object.defineProperty(runtime, 'Bun', {
                configurable: true,
                writable: true,
                value: { SQL: MockSQL }
            });
            return;
        }

        Object.defineProperty(runtime.Bun, 'SQL', {
            configurable: true,
            writable: true,
            value: MockSQL
        });
    }

    function registerDb(key: string, client: MockRuntimeSqlClient): DBBun {
        class MockSQL implements MockRuntimeSqlClient {
            unsafe = client.unsafe;
            begin = client.begin;
            close = client.close;
            reserve = client.reserve;
            options = client.options;

            constructor(_options?: Record<string, unknown> | string | URL, _optionsOverride?: Record<string, unknown>) {}
        }

        installMockSql(MockSQL);

        const db = DBBun.getInstance({ adapter: 'postgres' }, key);
        openDbs.push(db);
        return db;
    }

    it('executes root-level unsafe and query calls through Bun.SQL.unsafe', async () => {
        const rootUnsafe = vi.fn(async (_queryString: string, _values?: readonly unknown[]) => [{ value: 1 }]);
        const rootClient: MockRuntimeSqlClient = {
            unsafe: rootUnsafe,
            begin: async () => {
                throw new Error('begin should not be called in this test');
            },
            close: vi.fn(async () => {}),
            reserve: async () => {
                throw new Error('reserve should not be called in this test');
            },
            options: { adapter: 'postgres' }
        };

        const db = registerDb(`dbbun-root-${Date.now()}`, rootClient);

        const unsafeResult = await db.unsafe<Array<{ value: number }>>('SELECT $1 AS value', [1]);
        const queryResult = await db.query<Array<{ value: number }>>('SELECT $1 AS value', [2]);

        expect(unsafeResult).toEqual([{ value: 1 }]);
        expect(queryResult).toEqual([{ value: 1 }]);
        expect(rootUnsafe).toHaveBeenNthCalledWith(1, 'SELECT $1 AS value', [1]);
        expect(rootUnsafe).toHaveBeenNthCalledWith(2, 'SELECT $1 AS value', [2]);
    });

    it('exposes unsafe and query on reserved and transaction clients', async () => {
        const reservedUnsafe = vi.fn(async (_queryString: string, _values?: readonly unknown[]) => [{ value: 2 }]);
        const reservedRelease = vi.fn(async () => {});
        const reservedClient: MockRuntimeReservedSqlClient = {
            unsafe: reservedUnsafe,
            begin: async () => {
                throw new Error('nested begin should not be called in this test');
            },
            close: vi.fn(async () => {}),
            reserve: async () => {
                throw new Error('nested reserve should not be called in this test');
            },
            release: reservedRelease,
            options: { adapter: 'postgres' }
        };

        const transactionUnsafe = vi.fn(async (_queryString: string, _values?: readonly unknown[]) => [{ value: 3 }]);
        const transactionClient: MockRuntimeTransactionSqlClient = {
            unsafe: transactionUnsafe,
            begin: async <T>(fn: (sql: MockRuntimeTransactionSqlClient) => Promise<T> | T) => fn(transactionClient),
            close: vi.fn(async () => {}),
            reserve: async () => {
                throw new Error('reserve should not be called in this test');
            },
            savepoint: async <T>(fn: (sql: MockRuntimeTransactionSqlClient) => Promise<T> | T) => fn(transactionClient),
            options: { adapter: 'postgres' }
        };

        const rootClient: MockRuntimeSqlClient = {
            unsafe: vi.fn(async () => []),
            begin: vi.fn(async <T>(fn: (sql: MockRuntimeTransactionSqlClient) => Promise<T> | T) => fn(transactionClient)),
            close: vi.fn(async () => {}),
            reserve: vi.fn(async () => reservedClient),
            options: { adapter: 'postgres' }
        };

        const db = registerDb(`dbbun-nested-${Date.now()}`, rootClient);

        const reservedConnection = await db.connectReserved();
        const directUnsafeResult = await reservedConnection.unsafe<Array<{ value: number }>>('SELECT $1 AS value', [12]);
        const directQueryResult = await reservedConnection.query<Array<{ value: number }>>('SELECT $1 AS value', [122]);
        await reservedConnection.release();

        expect(directUnsafeResult).toEqual([{ value: 2 }]);
        expect(directQueryResult).toEqual([{ value: 2 }]);

        await db.reserve(async (connection) => {
            const unsafeResult = await connection.unsafe<Array<{ value: number }>>('SELECT $1 AS value', [2]);
            const queryResult = await connection.query<Array<{ value: number }>>('SELECT $1 AS value', [22]);

            expect(unsafeResult).toEqual([{ value: 2 }]);
            expect(queryResult).toEqual([{ value: 2 }]);
        });

        await db.transaction(async (transaction) => {
            const unsafeResult = await transaction.unsafe<Array<{ value: number }>>('SELECT $1 AS value', [3]);
            const queryResult = await transaction.query<Array<{ value: number }>>('SELECT $1 AS value', [33]);

            expect(unsafeResult).toEqual([{ value: 3 }]);
            expect(queryResult).toEqual([{ value: 3 }]);
        });

        expect(reservedUnsafe).toHaveBeenNthCalledWith(1, 'SELECT $1 AS value', [12]);
        expect(reservedUnsafe).toHaveBeenNthCalledWith(2, 'SELECT $1 AS value', [122]);
        expect(reservedUnsafe).toHaveBeenNthCalledWith(3, 'SELECT $1 AS value', [2]);
        expect(reservedUnsafe).toHaveBeenNthCalledWith(4, 'SELECT $1 AS value', [22]);
        expect(reservedRelease).toHaveBeenCalledTimes(2);
        expect(transactionUnsafe).toHaveBeenNthCalledWith(1, 'SELECT $1 AS value', [3]);
        expect(transactionUnsafe).toHaveBeenNthCalledWith(2, 'SELECT $1 AS value', [33]);
    });

    it('supports computed expressions in typed updates', async () => {
        const rootUnsafe = vi.fn(async (_queryString: string, _values?: readonly unknown[]) => [{ __affected: 1 }]);
        const rootClient: MockRuntimeSqlClient = {
            unsafe: rootUnsafe,
            begin: async () => {
                throw new Error('begin should not be called in this test');
            },
            close: vi.fn(async () => {}),
            reserve: async () => {
                throw new Error('reserve should not be called in this test');
            },
            options: { adapter: 'postgres' }
        };

        class MockSQL implements MockRuntimeSqlClient {
            unsafe = rootUnsafe;
            begin = rootClient.begin;
            close = rootClient.close;
            reserve = rootClient.reserve;
            options = rootClient.options;

            constructor(_options?: Record<string, unknown> | string | URL, _optionsOverride?: Record<string, unknown>) {}
        }

        installMockSql(MockSQL);

        const db = DBBun.create<TestSchema>({
            adapter: 'postgres',
            schemaMetadata: {
                users: { primaryKey: 'id' }
            }
        });
        openDbs.push(db);

        await db.update('users', {
            set: {
                login_count: bunDbExpr('"users"."login_count" + 1'),
                updated_at: new Date('2026-01-01T00:00:00.000Z')
            },
            where: {
                column: 'id',
                value: 42
            }
        });

        expect(rootUnsafe).toHaveBeenCalledWith(
            'UPDATE "users" SET "login_count" = "users"."login_count" + 1, "updated_at" = $1 WHERE "id" = $2 RETURNING 1 AS "__affected"',
            [new Date('2026-01-01T00:00:00.000Z'), 42]
        );
    });

    it('supports computed expressions in typed upserts', async () => {
        const rootUnsafe = vi.fn(async (_queryString: string, _values?: readonly unknown[]) => [{ __insert_id: 7 }]);
        const rootClient: MockRuntimeSqlClient = {
            unsafe: rootUnsafe,
            begin: async () => {
                throw new Error('begin should not be called in this test');
            },
            close: vi.fn(async () => {}),
            reserve: async () => {
                throw new Error('reserve should not be called in this test');
            },
            options: { adapter: 'postgres' }
        };

        class MockSQL implements MockRuntimeSqlClient {
            unsafe = rootUnsafe;
            begin = rootClient.begin;
            close = rootClient.close;
            reserve = rootClient.reserve;
            options = rootClient.options;

            constructor(_options?: Record<string, unknown> | string | URL, _optionsOverride?: Record<string, unknown>) {}
        }

        installMockSql(MockSQL);

        const db = DBBun.create<TestSchema>({
            adapter: 'postgres',
            schemaMetadata: {
                users: { primaryKey: 'id' }
            }
        });
        openDbs.push(db);

        await db.insert(
            'users',
            {
                email: 'test@example.com'
            },
            {
                upsert: {
                    conflictTarget: ['email'],
                    update: {
                        login_count: bunDbExpr('"users"."login_count" + 1')
                    }
                }
            }
        );

        expect(rootUnsafe).toHaveBeenCalledWith(
            'INSERT INTO "users" ("email") VALUES ($1) ON CONFLICT ("email") DO UPDATE SET "login_count" = "users"."login_count" + 1 RETURNING "id" AS "__insert_id"',
            ['test@example.com']
        );
    });
});
