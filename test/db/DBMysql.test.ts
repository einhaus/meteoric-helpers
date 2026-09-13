import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createConnection, createPool } = vi.hoisted(() => ({
    createPool: vi.fn(),
    createConnection: vi.fn()
}));

vi.mock('mysql2/promise.js', () => ({
    default: {
        createPool,
        createConnection
    }
}));

import { DBMysql } from '../../src/db/mysql.js';

type MockStreamablePool = {
    end: () => Promise<void>;
    format: (queryString: string, parameters?: unknown) => string;
    pool: {
        query: (queryString: string) => {
            stream: () => object;
        };
    };
};

const TEST_DB_CONFIG = {
    host: 'localhost',
    user: 'tester',
    password: 'secret',
    db: 'watchmode_test',
    logFolder: ''
};

let testInstanceId = 0;

const createMockPool = () => {
    const stream = { label: 'result-stream' };
    const streamFactory = vi.fn(() => stream);
    const query = vi.fn(() => ({ stream: streamFactory }));
    const format = vi.fn((queryString: string) => queryString);
    const end = vi.fn(async () => undefined);

    const pool = {
        end,
        format,
        pool: {
            query
        }
    } satisfies MockStreamablePool;

    return {
        end,
        format,
        pool,
        query,
        stream,
        streamFactory
    };
};

describe('DBMysql connection config', () => {
    beforeEach(() => {
        createConnection.mockReset();
        createPool.mockReset();
    });

    it('forces JSON and date columns to be returned as raw strings by default', () => {
        createPool.mockReturnValue(createMockPool().pool);

        const db = DBMysql.getInstance(TEST_DB_CONFIG, `config-pool-${testInstanceId++}`);
        db.getPool();

        expect(createPool).toHaveBeenCalledOnce();
        expect(createPool).toHaveBeenCalledWith(expect.objectContaining({ jsonStrings: true, dateStrings: true }));
    });

    it('allows opting into driver-decoded JSON columns', () => {
        createPool.mockReturnValue(createMockPool().pool);

        const db = DBMysql.getInstance({ ...TEST_DB_CONFIG, jsonStrings: false }, `config-pool-${testInstanceId++}`);
        db.getPool();

        expect(createPool).toHaveBeenCalledWith(expect.objectContaining({ jsonStrings: false }));
    });

    it('resets the pool when jsonStrings changes on an existing instance', async () => {
        createPool.mockReturnValue(createMockPool().pool);

        const instanceKey = `config-pool-${testInstanceId++}`;
        const db = DBMysql.getInstance(TEST_DB_CONFIG, instanceKey);
        db.getPool();
        expect(createPool).toHaveBeenCalledOnce();

        DBMysql.getInstance({ ...TEST_DB_CONFIG, jsonStrings: false }, instanceKey);

        await vi.waitFor(() => expect(createPool).toHaveBeenCalledTimes(2));
        expect(createPool).toHaveBeenLastCalledWith(expect.objectContaining({ jsonStrings: false }));
    });
});

const createMutationPool = (query: ReturnType<typeof vi.fn>) => ({
    end: vi.fn(async () => undefined),
    format: vi.fn((queryString: string) => queryString),
    query
});

const createDb = (maxRetries: number) =>
    DBMysql.getInstance({ ...TEST_DB_CONFIG, maxRetries, retryDelayMs: 0 }, `mutation-pool-${testInstanceId++}`);

const resetMutationMocks = () => {
    createConnection.mockReset();
    createPool.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
};

const createDbError = (message: string, code: string) => Object.assign(new Error(message), { code });

describe('DBMysql.doQuery', () => {
    beforeEach(resetMutationMocks);

    it('returns the result set header on success', async () => {
        const header = { affectedRows: 2, insertId: 0 };
        const query = vi.fn(async () => [header]);
        createPool.mockReturnValue(createMutationPool(query));

        const result = await createDb(3).doQuery({ queryString: 'DELETE FROM titles WHERE id = ?', parameters: [1] });

        expect(result).toBe(header);
        expect(query).toHaveBeenCalledOnce();
    });

    it('rethrows non-transient errors without retrying', async () => {
        const foreignKeyError = createDbError('Cannot delete or update a parent row', 'ER_ROW_IS_REFERENCED_2');
        const query = vi.fn(async () => {
            throw foreignKeyError;
        });
        createPool.mockReturnValue(createMutationPool(query));

        await expect(createDb(3).doQuery({ queryString: 'DELETE FROM titles WHERE id = ?', parameters: [1] })).rejects.toBe(
            foreignKeyError
        );
        expect(query).toHaveBeenCalledOnce();
    });

    it('retries transient errors and returns the eventual result', async () => {
        const deadlockError = createDbError('Deadlock found', 'ER_LOCK_DEADLOCK');
        const header = { affectedRows: 1, insertId: 0 };
        const query = vi.fn().mockRejectedValueOnce(deadlockError).mockResolvedValueOnce([header]);
        createPool.mockReturnValue(createMutationPool(query));

        const result = await createDb(3).doQuery({ queryString: 'UPDATE titles SET name = ? WHERE id = ?', parameters: ['a', 1] });

        expect(result).toBe(header);
        expect(query).toHaveBeenCalledTimes(2);
    });

    it('rethrows the transient error once retries are exhausted', async () => {
        const lockWaitError = createDbError('Lock wait timeout exceeded', 'ER_LOCK_WAIT_TIMEOUT');
        const query = vi.fn(async () => {
            throw lockWaitError;
        });
        createPool.mockReturnValue(createMutationPool(query));

        await expect(createDb(3).doQuery({ queryString: 'UPDATE titles SET name = ? WHERE id = ?', parameters: ['a', 1] })).rejects.toBe(
            lockWaitError
        );
        expect(query).toHaveBeenCalledTimes(3);
    });
});

describe('DBMysql.insert', () => {
    beforeEach(resetMutationMocks);

    it('returns the generated insert id', async () => {
        const query = vi.fn(async () => [{ affectedRows: 1, insertId: 17 }]);
        createPool.mockReturnValue(createMutationPool(query));

        await expect(createDb(3).insert<{ name: string }>({ table: 'titles', params: { name: 'a' } })).resolves.toBe(17);
        expect(query).toHaveBeenCalledOnce();
    });

    it('rethrows a duplicate-key error without retrying', async () => {
        const duplicateError = createDbError("Duplicate entry 'a' for key 'uniq_name'", 'ER_DUP_ENTRY');
        const query = vi.fn(async () => {
            throw duplicateError;
        });
        createPool.mockReturnValue(createMutationPool(query));

        await expect(createDb(3).insert<{ name: string }>({ table: 'titles', params: { name: 'a' } })).rejects.toBe(duplicateError);
        expect(query).toHaveBeenCalledOnce();
    });

    it('does not retry a lost connection because the insert may already have been applied', async () => {
        const connectionLostError = createDbError('Connection lost: The server closed the connection.', 'PROTOCOL_CONNECTION_LOST');
        const query = vi.fn(async () => {
            throw connectionLostError;
        });
        createPool.mockReturnValue(createMutationPool(query));

        await expect(createDb(3).insert<{ name: string }>({ table: 'titles', params: { name: 'a' } })).rejects.toBe(connectionLostError);
        expect(query).toHaveBeenCalledOnce();
    });

    it('retries deadlocks and returns the eventual insert id', async () => {
        const deadlockError = createDbError('Deadlock found', 'ER_LOCK_DEADLOCK');
        const query = vi
            .fn()
            .mockRejectedValueOnce(deadlockError)
            .mockResolvedValueOnce([{ affectedRows: 1, insertId: 23 }]);
        createPool.mockReturnValue(createMutationPool(query));

        await expect(createDb(3).insert<{ name: string }>({ table: 'titles', params: { name: 'a' } })).resolves.toBe(23);
        expect(query).toHaveBeenCalledTimes(2);
    });

    it('rethrows the original deadlock error once retries are exhausted', async () => {
        const deadlockError = createDbError('Deadlock found', 'ER_LOCK_DEADLOCK');
        const query = vi.fn(async () => {
            throw deadlockError;
        });
        createPool.mockReturnValue(createMutationPool(query));

        await expect(createDb(3).insert<{ name: string }>({ table: 'titles', params: { name: 'a' } })).rejects.toBe(deadlockError);
        expect(query).toHaveBeenCalledTimes(3);
    });
});

describe('DBMysql.insertMultiple', () => {
    beforeEach(resetMutationMocks);

    it('writes every row in one statement and returns the first insert id', async () => {
        const query = vi.fn(async () => [{ affectedRows: 2, insertId: 40 }]);
        const pool = createMutationPool(query);
        createPool.mockReturnValue(pool);

        const result = await createDb(3).insertMultiple<{ name: string }>({ table: 'titles', values: [{ name: 'a' }, { name: 'b' }] });

        expect(result).toBe(40);
        expect(query).toHaveBeenCalledOnce();
        expect(pool.format).toHaveBeenCalledWith(expect.stringContaining('VALUES (?), (?)'), ['a', 'b']);
    });

    it('rethrows insert errors', async () => {
        const missingDefaultError = createDbError("Field 'cryptoId' doesn't have a default value", 'ER_NO_DEFAULT_FOR_FIELD');
        const query = vi.fn(async () => {
            throw missingDefaultError;
        });
        createPool.mockReturnValue(createMutationPool(query));

        await expect(createDb(3).insertMultiple<{ name: string }>({ table: 'titles', values: [{ name: 'a' }] })).rejects.toBe(
            missingDefaultError
        );
        expect(query).toHaveBeenCalledOnce();
    });

    it('returns 0 without querying when there are no rows', async () => {
        const query = vi.fn();
        createPool.mockReturnValue(createMutationPool(query));

        await expect(createDb(3).insertMultiple<{ name: string }>({ table: 'titles', values: [] })).resolves.toBe(0);
        expect(createPool).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
    });

    it('throws when the first row is missing', async () => {
        const query = vi.fn();
        createPool.mockReturnValue(createMutationPool(query));

        await expect(
            createDb(3).insertMultiple<{ name: string }>({ table: 'titles', values: new Array<{ name: string }>(1) })
        ).rejects.toThrow('insertMultiple into `titles` received an undefined first row');
        expect(query).not.toHaveBeenCalled();
    });
});

describe('DBMysql.createResultStream', () => {
    beforeEach(() => {
        createConnection.mockReset();
        createPool.mockReset();
    });

    it('initializes the pool lazily before creating a result stream', () => {
        const mockPool = createMockPool();
        createPool.mockReturnValue(mockPool.pool);

        const db = DBMysql.getInstance(TEST_DB_CONFIG, `stream-pool-${testInstanceId++}`);

        const resultStream = db.createResultStream('SELECT * FROM titles WHERE id = ?', [123]);

        expect(createPool).toHaveBeenCalledOnce();
        expect(mockPool.format).toHaveBeenCalledWith('SELECT * FROM titles WHERE id = ?', [123]);
        expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM titles WHERE id = ?');
        expect(mockPool.streamFactory).toHaveBeenCalledOnce();
        expect(resultStream).toBe(mockPool.stream);
    });
});
