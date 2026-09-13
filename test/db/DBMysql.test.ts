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

describe('DBMysql.doQuery', () => {
    const createMutationPool = (query: ReturnType<typeof vi.fn>) => ({
        end: vi.fn(async () => undefined),
        format: vi.fn((queryString: string) => queryString),
        query
    });

    const createDb = (maxRetries: number) =>
        DBMysql.getInstance({ ...TEST_DB_CONFIG, maxRetries, retryDelayMs: 0 }, `mutation-pool-${testInstanceId++}`);

    beforeEach(() => {
        createConnection.mockReset();
        createPool.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('returns the result set header on success', async () => {
        const header = { affectedRows: 2, insertId: 0 };
        const query = vi.fn(async () => [header]);
        createPool.mockReturnValue(createMutationPool(query));

        const result = await createDb(3).doQuery({ queryString: 'DELETE FROM titles WHERE id = ?', parameters: [1] });

        expect(result).toBe(header);
        expect(query).toHaveBeenCalledOnce();
    });

    it('rethrows non-transient errors without retrying', async () => {
        const foreignKeyError = Object.assign(new Error('Cannot delete or update a parent row'), { code: 'ER_ROW_IS_REFERENCED_2' });
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
        const deadlockError = Object.assign(new Error('Deadlock found'), { code: 'ER_LOCK_DEADLOCK' });
        const header = { affectedRows: 1, insertId: 0 };
        const query = vi.fn().mockRejectedValueOnce(deadlockError).mockResolvedValueOnce([header]);
        createPool.mockReturnValue(createMutationPool(query));

        const result = await createDb(3).doQuery({ queryString: 'UPDATE titles SET name = ? WHERE id = ?', parameters: ['a', 1] });

        expect(result).toBe(header);
        expect(query).toHaveBeenCalledTimes(2);
    });

    it('rethrows the transient error once retries are exhausted', async () => {
        const lockWaitError = Object.assign(new Error('Lock wait timeout exceeded'), { code: 'ER_LOCK_WAIT_TIMEOUT' });
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
