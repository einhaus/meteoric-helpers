import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { testConfig, testToken } from './fixtures.js';

const reader = { query: mock(), initialize: mock(), close: mock() };
await mock.module('../../src/mcp/database/mariadb.js', () => ({
    MariaDbMcpReader: class {
        initialize = reader.initialize;
        query = reader.query;
        close = reader.close;
        describe() {
            return [{ name: 'id', type: 'int', nullable: false }];
        }
    }
}));
const { startDatabaseMcpServer } = await import('../../src/mcp/database/server.js');

describe('database MCP HTTP lifecycle and limits', () => {
    let service: Awaited<ReturnType<typeof startDatabaseMcpServer>> | undefined;
    const clients: Client[] = [];
    beforeEach(() => {
        reader.initialize.mockReset().mockResolvedValue(undefined);
        reader.close.mockReset().mockResolvedValue(undefined);
        reader.query.mockReset().mockResolvedValue({ columns: ['id'], rows: [[1]], truncated: false });
    });
    afterEach(async () => {
        await Promise.allSettled(clients.splice(0).map((client) => client.close()));
        await service?.close();
        service = undefined;
    });
    async function connect(): Promise<Client> {
        if (!service) throw new Error('service');
        const client = new Client({ name: 'test', version: '1.0.0' });
        clients.push(client);
        await client.connect(
            new StreamableHTTPClientTransport(new URL(service.url), {
                requestInit: { headers: { Authorization: `Bearer ${testToken}` } }
            }) as Transport
        );
        return client;
    }
    it('supports a real SDK client and rejects SQL before reaching the driver', async () => {
        service = await startDatabaseMcpServer(testConfig(), { audit: mock() });
        const client = await connect();
        expect((await client.listTools()).tools).toHaveLength(3);
        expect((await client.callTool({ name: 'query', arguments: { sql: 'SELECT password FROM titles' } })).isError).toBe(true);
        expect(reader.query).not.toHaveBeenCalled();
        expect((await client.callTool({ name: 'query', arguments: { sql: 'SELECT id FROM titles' } })).isError).not.toBe(true);
        expect(reader.query).toHaveBeenCalledTimes(1);
    });
    it('caps concurrent queries across all identities and releases capacity', async () => {
        const config = testConfig();
        config.limits.maxConcurrentQueries = 1;
        service = await startDatabaseMcpServer(config, { audit: mock() });
        const client = await connect();
        const started = Promise.withResolvers<void>();
        const pending = Promise.withResolvers<{ columns: string[]; rows: number[][]; truncated: boolean }>();
        reader.query.mockImplementationOnce(() => {
            started.resolve();
            return pending.promise;
        });
        const first = client.callTool({ name: 'query', arguments: { sql: 'SELECT id FROM titles' } });
        try {
            await started.promise;
            expect(reader.query).toHaveBeenCalledTimes(1);
            const second = await client.callTool({ name: 'query', arguments: { sql: 'SELECT id FROM titles' } });
            expect(second.isError).toBe(true);
            expect(JSON.stringify(second)).toContain('capacity');
        } finally {
            pending.resolve({ columns: ['id'], rows: [[1]], truncated: false });
            await first;
        }
        expect((await client.callTool({ name: 'query', arguments: { sql: 'SELECT id FROM titles' } })).isError).not.toBe(true);
    });
    it('applies per-identity rate limits', async () => {
        const config = testConfig();
        config.limits.requestsPerMinute = 1;
        service = await startDatabaseMcpServer(config, { audit: mock() });
        const request = {
            method: 'POST',
            headers: { Authorization: `Bearer ${testToken}`, 'Content-Type': 'application/json' },
            body: '{}'
        };
        await fetch(service.url, request);
        const response = await fetch(service.url, request);
        expect(response.status).toBe(429);
        expect(response.headers.has('Retry-After')).toBe(true);
    });
    it('withholds oversized results and disables access when auditing fails', async () => {
        const config = testConfig();
        config.limits.maxBytes = 16384;
        const audit = mock();
        service = await startDatabaseMcpServer(config, { audit });
        const client = await connect();
        reader.query.mockResolvedValueOnce({ columns: ['title'], rows: [['x'.repeat(17000)]], truncated: false });
        expect((await client.callTool({ name: 'query', arguments: { sql: 'SELECT title FROM titles' } })).isError).toBe(true);
        audit.mockRejectedValueOnce(new Error('sensitive sink failure'));
        const result = await client.callTool({ name: 'list_tables' });
        expect(result.isError).toBe(true);
        expect(JSON.stringify(result)).not.toContain('sensitive sink failure');
        expect((await fetch(service.url)).status).toBe(503);
    });
    it('cleans up all pools when preflight fails', async () => {
        reader.initialize.mockRejectedValueOnce(new Error('preflight failure'));
        await expect(startDatabaseMcpServer(testConfig(), { audit: mock() })).rejects.toThrow('preflight failure');
        expect(reader.close).toHaveBeenCalledTimes(1);
    });
    it('fails closed when an audit sink stalls', async () => {
        service = await startDatabaseMcpServer(testConfig(), { audit: () => new Promise(() => undefined) });
        const client = await connect();
        const result = await client.callTool({ name: 'list_tables' });
        expect(result.isError).toBe(true);
        expect((await fetch(service.url)).status).toBe(503);
    });
});
