import { afterEach, describe, expect, it, vi } from 'vitest';
import { doFetch } from '../../src/misc/doFetch.js';

describe('doFetch', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
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
});
