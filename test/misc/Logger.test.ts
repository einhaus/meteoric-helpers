import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { Logger, formatLoggerTimestampForClickHouse } from '../../src/misc/Logger.js';

describe('Logger', () => {
    afterEach(() => {
        Logger.resetInstanceForTests();
    });

    it('formats ClickHouse timestamps in UTC using epoch milliseconds', () => {
        const unixTimestampMs = Date.UTC(2026, 3, 8, 14, 5, 4, 809);

        expect(formatLoggerTimestampForClickHouse(unixTimestampMs)).toBe('2026-04-08 14:05:04.809');
    });

    it('writes log records with UTC timestamps aligned to unix_timestamp', () => {
        const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'meteoric-logger-'));
        const logDir = path.join(tempRoot, 'logs');

        try {
            const logger = Logger.getInstance({
                logDir,
                jobLogDir: path.join(logDir, 'jobLogs'),
                enableDuplicateSuppression: false
            });

            logger.log({
                level: 'warn',
                severity: 4,
                service: 'test-service',
                category: 'logger-test',
                message: 'timestamp test'
            });

            const filesDir = path.join(logDir, 'files');
            const logFiles = readdirSync(filesDir);

            expect(logFiles).toHaveLength(1);

            const recordJson = readFileSync(path.join(filesDir, logFiles[0]!), 'utf8');
            const record = JSON.parse(recordJson) as { timestamp: string; unix_timestamp: number };

            expect(record.timestamp).toBe(formatLoggerTimestampForClickHouse(record.unix_timestamp));
        } finally {
            rmSync(tempRoot, { recursive: true, force: true });
        }
    });
});
