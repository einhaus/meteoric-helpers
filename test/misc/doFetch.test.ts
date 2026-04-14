import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { doFetch } from '../../src/misc/doFetch.js';
import { Logger } from '../../src/misc/Logger.js';

describe('doFetch', () => {
    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;
    const originalConsoleLog = console.log;

    afterEach(() => {
        globalThis.fetch = originalFetch;
        Logger.resetInstanceForTests();
        console.error = originalConsoleError;
        console.log = originalConsoleLog;
        vi.restoreAllMocks();
    });

    it('redacts normalized secret headers in timeout responses', async () => {
        globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
            return new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener(
                    'abort',
                    () => {
                        reject(new Error('The operation was aborted.'));
                    },
                    { once: true }
                );
            });
        }) as typeof fetch;

        const response = await doFetch('https://paper-api.alpaca.markets/v2/account', {
            headers: {
                'APCA-API-KEY-ID': 'PKFV123456789',
                'APCA-API-SECRET-KEY': '3oq658nfPCL2M1Jdo8uzsdfsdfsfN2cnz7zxjtr3zWC1kSE'
            },
            timeoutMilliseconds: 1,
            timesToRetry: 0
        });

        expect('isError' in response && response.isError).toBe(true);

        if (!('isError' in response) || !response.isError) {
            throw new Error('Expected doFetch to return an error response');
        }

        expect(response.statusCode).toBe(408);
        expect(response.message).toContain('"APCA-API-KEY-ID":"PKFV[REDACTED]"');
        expect(response.message).toContain('"APCA-API-SECRET-KEY":"3oq6[REDACTED]"');
        expect(response.message).not.toContain('3oq658nfPCL2M1Jdo8uzsdfsdfsfN2cnz7zxjtr3zWC1kSE');
    });

    it('writes fetch errors to the requested logDirectory when no logger singleton exists', async () => {
        const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'meteoric-dofetch-no-logger-'));
        const logDir = path.join(tempRoot, 'logs');

        globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
            return new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener(
                    'abort',
                    () => {
                        reject(new Error('The operation was aborted.'));
                    },
                    { once: true }
                );
            });
        }) as typeof fetch;

        try {
            const response = await doFetch('https://paper-api.alpaca.markets/v2/account?token=raw-secret-token', {
                headers: {
                    Authorization: 'Bearer raw-secret-token'
                },
                timeoutMilliseconds: 1,
                timesToRetry: 0,
                logDirectory: logDir
            });

            expect('isError' in response && response.isError).toBe(true);

            const logFile = path.join(logDir, 'doFetchErrors.log');
            expect(existsSync(logFile)).toBe(true);

            const logContents = readFileSync(logFile, 'utf8');
            expect(logContents).toContain('"requestUrl":"https://paper-api.alpaca.markets/v2/account?token=%5BREDACTED%5D"');
            expect(logContents).toContain('"Authorization":"Bearer [REDACTED]"');
            expect(logContents).not.toContain('raw-secret-token');
        } finally {
            rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    it('uses the active logger singleton when the requested logDirectory matches the logger config', async () => {
        const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'meteoric-dofetch-with-logger-'));
        const logDir = path.join(tempRoot, 'logs');
        const logger = Logger.getInstance({
            logDir,
            jobLogDir: path.join(logDir, 'jobLogs'),
            enableDuplicateSuppression: false,
            outputSeverity: 99
        });
        const logSpy = vi.spyOn(logger, 'log');

        globalThis.fetch = vi.fn(async () => {
            return new Response(JSON.stringify({ message: 'Service unavailable' }), {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'application/json' }
            });
        }) as typeof fetch;

        try {
            const response = await doFetch('https://example.com/status?token=raw-secret-token', {
                headers: {
                    Authorization: 'Bearer raw-secret-token'
                },
                timeoutMilliseconds: 1,
                timesToRetry: 0,
                logDirectory: logDir
            });

            expect('isError' in response && response.isError).toBe(true);
            expect(logSpy).toHaveBeenCalledTimes(1);
            expect(logSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    level: 'error',
                    severity: 7,
                    service: 'doFetch',
                    category: 'request',
                    message: 'Service unavailable'
                })
            );
            expect(existsSync(path.join(logDir, 'doFetchErrors.log'))).toBe(false);
        } finally {
            rmSync(tempRoot, { recursive: true, force: true });
        }
    });
});
