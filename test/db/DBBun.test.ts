import { afterEach, describe, expect, it, vi } from 'vitest';
import { bunDbExpr, type BunDbRuntimeSchemaMetadata, type BunDbSchemaTable } from '../../src/db/bunDbTypes.js';
import { DBBun, type DBBunConfig } from '../../src/db/bun.js';

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
    ledger_entries: BunDbSchemaTable<
        {
            id: number;
            user_id: number | null;
            amount_cents: number;
            memo: string;
            position: number;
        },
        {
            id?: number;
            user_id?: number | null;
            amount_cents: number;
            memo: string;
            position: number;
        },
        {
            user_id?: number | null;
            amount_cents?: number;
            memo?: string;
            position?: number;
        },
        'id'
    >;
    plans: BunDbSchemaTable<{ code: string; name: string }, { code: string; name: string }, { name?: string }, 'code'>;
}

// Mirrors the generated metadata shape: `ledger_entries` has int8 columns, `users` and `plans` do not.
const bigintSchemaMetadata = {
    users: { primaryKey: 'id' },
    ledger_entries: { primaryKey: 'id', bigintColumns: ['id', 'user_id', 'amount_cents'] },
    plans: { primaryKey: 'code' }
} as const satisfies BunDbRuntimeSchemaMetadata<TestSchema>;

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

    function installMockClient(client: MockRuntimeSqlClient): void {
        class MockSQL implements MockRuntimeSqlClient {
            unsafe = client.unsafe;
            begin = client.begin;
            close = client.close;
            reserve = client.reserve;
            options = client.options;

            constructor(_options?: Record<string, unknown> | string | URL, _optionsOverride?: Record<string, unknown>) {}
        }

        installMockSql(MockSQL);
    }

    function registerDb(key: string, client: MockRuntimeSqlClient): DBBun {
        installMockClient(client);

        const db = DBBun.getInstance({ adapter: 'postgres' }, key);
        openDbs.push(db);
        return db;
    }

    function createMockClient(
        unsafe: MockRuntimeSqlClient['unsafe'],
        overrides: Partial<Omit<MockRuntimeSqlClient, 'unsafe'>> = {}
    ): MockRuntimeSqlClient {
        return {
            unsafe,
            begin: async () => {
                throw new Error('begin should not be called in this test');
            },
            close: vi.fn(async () => {}),
            reserve: async () => {
                throw new Error('reserve should not be called in this test');
            },
            options: { adapter: 'postgres' },
            ...overrides
        };
    }

    function createSchemaDb(client: MockRuntimeSqlClient, adapter: DBBunConfig['adapter'] = 'postgres'): DBBun<TestSchema> {
        installMockClient(client);

        const db = DBBun.create<TestSchema>({ adapter, schemaMetadata: bigintSchemaMetadata });
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

    // Bun.SQL returns Postgres int8 values as strings, so the mocks below return them that way.
    describe('Postgres bigint columns', () => {
        it('coerces every bigint column when selecting all columns', async () => {
            const db = createSchemaDb(
                createMockClient(async () => [
                    { id: '17', user_id: '4', amount_cents: '-250', memo: 'refund', position: 2 },
                    { id: '18', user_id: null, amount_cents: '0', memo: 'opening', position: 3 }
                ])
            );

            const rows = await db.select('ledger_entries');

            expect(rows).toEqual([
                { id: 17, user_id: 4, amount_cents: -250, memo: 'refund', position: 2 },
                { id: 18, user_id: null, amount_cents: 0, memo: 'opening', position: 3 }
            ]);
            expect(new Set([17]).has(rows[0]?.id ?? 0)).toBe(true);
        });

        it('coerces only the selected bigint columns', async () => {
            const unsafe = vi.fn(async (_queryString: string, _values?: readonly unknown[]) => [{ user_id: '4', memo: 'refund' }]);
            const db = createSchemaDb(createMockClient(unsafe));

            const row = await db.selectOne('ledger_entries', {
                columns: ['user_id', 'memo'],
                where: { column: 'id', value: 17 }
            });

            expect(row).toEqual({ user_id: 4, memo: 'refund' });
            expect(unsafe).toHaveBeenCalledWith('SELECT "user_id", "memo" FROM "ledger_entries" WHERE "id" = $1 LIMIT $2', [17, 1]);
        });

        it('converts bigint values returned when Bun.SQL runs with bigint: true', async () => {
            const db = createSchemaDb(
                createMockClient(async () => [{ id: 17n, user_id: null, amount_cents: -250n, memo: 'refund', position: 2 }])
            );

            expect(await db.select('ledger_entries')).toEqual([{ id: 17, user_id: null, amount_cents: -250, memo: 'refund', position: 2 }]);
        });

        it.each([
            ['9007199254740992', 'Bigint column ledger_entries.id value 9007199254740992 exceeds the safe integer range.'],
            [-9007199254740992n, 'Bigint column ledger_entries.id value -9007199254740992 exceeds the safe integer range.'],
            ['12.5', 'Bigint column ledger_entries.id value "12.5" is not a valid integer string.'],
            [undefined, 'Unsupported value type undefined for bigint column ledger_entries.id.']
        ])('rejects bigint value %s instead of returning it with the wrong type', async (value, message) => {
            const db = createSchemaDb(createMockClient(async () => [{ id: value }]));

            await expect(db.select('ledger_entries', { columns: ['id'] })).rejects.toThrow(message);
        });

        it('coerces bigint columns on transaction, savepoint and reserved connection handles', async () => {
            const scopedUnsafe = vi.fn(async (_queryString: string, _values?: readonly unknown[]) => [
                { id: '17', user_id: '4', amount_cents: '100', memo: 'refund', position: 1 }
            ]);
            const transactionClient: MockRuntimeTransactionSqlClient = {
                ...createMockClient(scopedUnsafe),
                begin: async <T>(fn: (sql: MockRuntimeTransactionSqlClient) => Promise<T> | T) => fn(transactionClient),
                savepoint: async <T>(fn: (sql: MockRuntimeTransactionSqlClient) => Promise<T> | T) => fn(transactionClient)
            };
            const reservedClient: MockRuntimeReservedSqlClient = {
                ...createMockClient(scopedUnsafe),
                release: vi.fn(async () => {})
            };
            const db = createSchemaDb(
                createMockClient(
                    async () => {
                        throw new Error('root unsafe should not be called in this test');
                    },
                    {
                        begin: async <T>(fn: (sql: MockRuntimeTransactionSqlClient) => Promise<T> | T) => fn(transactionClient),
                        reserve: async () => reservedClient
                    }
                )
            );
            const expected = { id: 17, user_id: 4, amount_cents: 100, memo: 'refund', position: 1 };

            await db.transaction(async (transaction) => {
                expect(await transaction.select('ledger_entries')).toEqual([expected]);
                expect(await transaction.selectOne('ledger_entries', { forUpdate: true })).toEqual(expected);

                await transaction.savepoint(async (savepoint) => {
                    expect(await savepoint.selectOne('ledger_entries')).toEqual(expected);
                });
            });

            await db.reserve(async (connection) => {
                expect(await connection.select('ledger_entries')).toEqual([expected]);
            });

            const reservedConnection = await db.connectReserved();

            try {
                expect(await reservedConnection.selectOne('ledger_entries')).toEqual(expected);
            } finally {
                await reservedConnection.release();
            }

            expect(scopedUnsafe).toHaveBeenCalledTimes(5);
        });

        it('returns bigint primary keys from inserts as numbers', async () => {
            const unsafe = vi.fn(async (_queryString: string, _values?: readonly unknown[]) => [
                { __insert_id: '41' },
                { __insert_id: '42' }
            ]);
            const db = createSchemaDb(createMockClient(unsafe));

            const result = await db.insertMany('ledger_entries', [
                { amount_cents: 100, memo: 'first', position: 1 },
                { amount_cents: 200, memo: 'second', position: 2 }
            ]);

            expect(result).toEqual({ affectedRows: 2, insertId: 42 });
            expect(unsafe).toHaveBeenCalledWith(
                'INSERT INTO "ledger_entries" ("amount_cents", "memo", "position") VALUES ($1, $2, $3), ($4, $5, $6) RETURNING "id" AS "__insert_id"',
                [100, 'first', 1, 200, 'second', 2]
            );
        });

        it('returns primary keys of other types unchanged', async () => {
            const db = createSchemaDb(createMockClient(async () => [{ __insert_id: 'pro' }]));

            expect(await db.insert('plans', { code: 'pro', name: 'Pro' })).toEqual({ affectedRows: 1, insertId: 'pro' });
        });

        it('omits insertId when the insert returns no rows', async () => {
            const db = createSchemaDb(createMockClient(async () => []));

            expect(await db.insert('ledger_entries', { amount_cents: 100, memo: 'duplicate', position: 1 }, { ignore: true })).toEqual({
                affectedRows: 0
            });
        });

        it('leaves rows untouched for tables without bigint metadata and for MySQL', async () => {
            const postgresDb = createSchemaDb(createMockClient(async () => [{ id: '17', email: 'test@example.com' }]));
            expect(await postgresDb.select('users', { columns: ['id', 'email'] })).toEqual([{ id: '17', email: 'test@example.com' }]);

            // Bun.SQL's MySQL adapter already returns BIGINT values in the safe integer range as numbers.
            const mysqlDb = createSchemaDb(
                createMockClient(async () => [{ id: '17' }]),
                'mysql'
            );
            expect(await mysqlDb.select('ledger_entries', { columns: ['id'] })).toEqual([{ id: '17' }]);
        });
    });
});
