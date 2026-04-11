import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { Logger, formatLoggerTimestampForClickHouse } from '../../src/misc/Logger.js';

describe('Logger', () => {
    const originalConsoleError = console.error;
    const originalConsoleLog = console.log;

    afterEach(() => {
        Logger.resetInstanceForTests();
        console.error = originalConsoleError;
        console.log = originalConsoleLog;
        vi.restoreAllMocks();
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

    it('redacts secrets embedded in console.error messages before forwarding and writing logs', () => {
        const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'meteoric-logger-redaction-'));
        const logDir = path.join(tempRoot, 'logs');
        const forwardedConsoleError = vi.fn();

        console.error = forwardedConsoleError as typeof console.error;

        const rawMessage =
            'Failed to sync Alpaca balances: {"status":408,"requestDetails":{"headers":{"APCA-API-KEY-ID":"PKFV123456789","APCA-API-SECRET-KEY":"3oq658nfPCL2M1Jdo8uzsdfsdfsfN2cnz7zxjtr3zWC1kSE","Authorization":"Bearer raw-secret-token"}}}';

        try {
            Logger.getInstance({
                logDir,
                jobLogDir: path.join(logDir, 'jobLogs'),
                enableDuplicateSuppression: false,
                outputSeverity: 99
            });

            console.error(rawMessage);

            expect(forwardedConsoleError).toHaveBeenCalledTimes(1);

            const forwardedMessage = String(forwardedConsoleError.mock.calls[0]?.[0] ?? '');
            expect(forwardedMessage).toContain('"APCA-API-KEY-ID":"PKFV[REDACTED]"');
            expect(forwardedMessage).toContain('"APCA-API-SECRET-KEY":"3oq6[REDACTED]"');
            expect(forwardedMessage).toContain('"Authorization":"Bearer [REDACTED]"');
            expect(forwardedMessage).not.toContain('3oq658nfPCL2M1Jdo8uzsdfsdfsfN2cnz7zxjtr3zWC1kSE');
            expect(forwardedMessage).not.toContain('raw-secret-token');

            const filesDir = path.join(logDir, 'files');
            const logFiles = readdirSync(filesDir);
            expect(logFiles).toHaveLength(1);

            const recordJson = readFileSync(path.join(filesDir, logFiles[0]!), 'utf8');
            const record = JSON.parse(recordJson) as { message: string; error?: { message?: string; stack?: string } };

            expect(record.message).toContain('"APCA-API-SECRET-KEY":"3oq6[REDACTED]"');
            expect(record.message).toContain('"Authorization":"Bearer [REDACTED]"');
            expect(record.error?.message).toContain('"APCA-API-SECRET-KEY":"3oq6[REDACTED]"');
            expect(record.error?.stack).toContain('"Authorization":"Bearer [REDACTED]"');
            expect(recordJson).not.toContain('3oq658nfPCL2M1Jdo8uzsdfsdfsfN2cnz7zxjtr3zWC1kSE');
            expect(recordJson).not.toContain('raw-secret-token');
        } finally {
            rmSync(tempRoot, { recursive: true, force: true });
        }
    });
});
