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

    it.each([204, 205])('accepts an empty JSON-labelled %i response without logging a parse error', async (status) => {
        const response = new Response(null, { status, headers: { 'Content-Type': 'application/json' } });
        const jsonSpy = vi.spyOn(response, 'json');
        const consoleSpy = vi.spyOn(console, 'error');
        globalThis.fetch = vi.fn(async () => response) as typeof fetch;

        expect(await doFetch<string>('https://example.com/orders/one', { method: 'DELETE', timesToRetry: 0 })).toBe('');
        expect(jsonSpy).not.toHaveBeenCalled();
        expect(consoleSpy).not.toHaveBeenCalled();
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it.each([403, 429, 500])('logs HTTP %i without a logDirectory or logger', async (status) => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        globalThis.fetch = vi.fn(
            async () =>
                new Response('{"error":"raw-sensitive-provider-body"}', {
                    status,
                    headers: { 'content-type': 'application/json' }
                })
        ) as typeof fetch;
        const result = await doFetch('https://example.com/data?token=raw-secret-token', { timesToRetry: 0 });
        expect(result).toMatchObject({ isError: true, statusCode: status });
        expect(log).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(log.mock.calls)).not.toContain('raw-secret-token');
        expect(JSON.stringify(log.mock.calls)).not.toContain('raw-sensitive-provider-body');
    });

    it('keeps an unconfigured 404 visible', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        globalThis.fetch = vi.fn(async () => new Response('Not found', { status: 404 })) as typeof fetch;

        expect(await doFetch('https://example.com/show', { timesToRetry: 0 })).toMatchObject({ isError: true, statusCode: 404 });
        expect(log).toHaveBeenCalledOnce();
    });

    it('returns an expected 404 without console error logging', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        globalThis.fetch = vi.fn(async () => new Response('Not found', { status: 404 })) as typeof fetch;

        expect(await doFetch('https://example.com/show', { expectedStatusCodes: [404] })).toMatchObject({
            isError: true,
            statusCode: 404,
            message: 'Not found'
        });
        expect(globalThis.fetch).toHaveBeenCalledOnce();
        expect(log).not.toHaveBeenCalled();
    });

    it('keeps expected misses out of both the active logger and requested log files', async () => {
        const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'meteoric-dofetch-expected-'));
        const logDir = path.join(tempRoot, 'logs');
        const logger = Logger.getInstance({ logDir, outputSeverity: 99 });
        const log = vi.spyOn(logger, 'log').mockImplementation(() => undefined);
        globalThis.fetch = vi.fn(async () => new Response('Not found', { status: 404 })) as typeof fetch;

        try {
            await doFetch('https://example.com/show', { expectedStatusCodes: [404], logDirectory: logDir });
            expect(log).not.toHaveBeenCalled();
            Logger.resetInstanceForTests();
            await doFetch('https://example.com/show', { expectedStatusCodes: [404], logDirectory: logDir });
            expect(existsSync(path.join(logDir, 'doFetchErrors.log'))).toBe(false);
        } finally {
            rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    it('preserves retries before an expected final status', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        globalThis.fetch = vi
            .fn()
            .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
            .mockResolvedValueOnce(new Response('Not found', { status: 404 })) as typeof fetch;

        expect(
            await doFetch('https://example.com/show', { expectedStatusCodes: [404], timesToRetry: 1, retryDelayMilliseconds: 1 })
        ).toMatchObject({ isError: true, statusCode: 404 });
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(log).not.toHaveBeenCalled();
    });

    it.each([429, 500, 503])('does not hide unexpected HTTP %i', async (status) => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        globalThis.fetch = vi.fn(async () => new Response('Failure', { status })) as typeof fetch;

        expect(await doFetch('https://example.com/show', { expectedStatusCodes: [404], timesToRetry: 0 })).toMatchObject({
            isError: true,
            statusCode: status
        });
        expect(log).toHaveBeenCalledOnce();
    });

    it('does not hide transport failures or malformed successful responses', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Connection closed')) as typeof fetch;
        expect(await doFetch('https://example.com/show', { expectedStatusCodes: [404], timesToRetry: 0 })).toMatchObject({ isError: true });
        expect(log).toHaveBeenCalledOnce();

        globalThis.fetch = vi.fn(async () => new Response('{broken', { headers: { 'content-type': 'application/json' } })) as typeof fetch;
        expect(await doFetch('https://example.com/show', { expectedStatusCodes: [404, 200], timesToRetry: 0 })).toMatchObject({
            isError: true
        });
        expect(log).toHaveBeenCalledTimes(2);
    });

    it('does not treat a synthetic transport timeout as an expected HTTP response', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Connection closed')) as typeof fetch;

        expect(await doFetch('https://example.com/show', { expectedStatusCodes: [408], timesToRetry: 0 })).toMatchObject({
            isError: true,
            statusCode: 408
        });
        expect(log).toHaveBeenCalledOnce();
    });

    it('uses the active logger without requiring a logDirectory', async () => {
        const logger = Logger.getInstance({ logDir: path.join(os.tmpdir(), 'dofetch-unused'), outputSeverity: 99 });
        const log = vi.spyOn(logger, 'log').mockImplementation(() => undefined);
        globalThis.fetch = vi.fn(async () => new Response('{broken', { headers: { 'content-type': 'application/json' } })) as typeof fetch;
        expect(await doFetch('https://example.com/data', { timesToRetry: 0 })).toMatchObject({ isError: true });
        expect(log).toHaveBeenCalledOnce();
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
        expect(response.message).toContain('"apca-api-key-id":"PKFV[REDACTED]"');
        expect(response.message).toContain('"apca-api-secret-key":"3oq6[REDACTED]"');
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
            expect(logContents).toContain('"Authorization":"[REDACTED]"');
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
                    message: 'Request failed (HTTP 503)'
                })
            );
            expect(existsSync(path.join(logDir, 'doFetchErrors.log'))).toBe(false);
        } finally {
            rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    it('extracts a string message from OpenAI-style nested error payloads', async () => {
        globalThis.fetch = vi.fn(async () => {
            return new Response(
                JSON.stringify({
                    error: {
                        message: 'The model `gpt-example` does not exist or you do not have access to it.',
                        type: 'invalid_request_error',
                        code: 'model_not_found'
                    }
                }),
                {
                    status: 404,
                    statusText: 'Not Found',
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }) as typeof fetch;

        const response = await doFetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            type: 'json',
            timesToRetry: 0,
            params: { model: 'gpt-example', messages: [] }
        });

        expect('isError' in response && response.isError).toBe(true);

        if (!('isError' in response) || !response.isError) {
            throw new Error('Expected doFetch to return an error response');
        }

        expect(response.message).toBe('The model `gpt-example` does not exist or you do not have access to it.');
        expect(typeof response.message).toBe('string');
        expect(response.statusCode).toBe(404);
    });
});
