import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import mysql, { type Connection } from 'mysql2/promise';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { startDatabaseMcpServer } from '../../src/mcp/database/server.js';
import { MariaDbMcpReader } from '../../src/mcp/database/mariadb.js';
import { compileDatabaseQuery } from '../../src/mcp/database/query.js';
import { createDatabaseMcpRedactor } from '../../src/mcp/database/redaction.js';
import type { DatabaseMcpAuditEvent } from '../../src/mcp/database/config.js';
import { testConfig, testToken, secondToken } from './fixtures.js';

const basedir = process.env.MCP_TEST_MARIADB_BASEDIR;
describe.runIf(Boolean(basedir))('database MCP with disposable MariaDB and real HTTP client', () => {
    let directory: string;
    let process: ChildProcess;
    let admin: Connection;
    let port: number;
    let service: Awaited<ReturnType<typeof startDatabaseMcpServer>>;
    const clients: Client[] = [];
    const events: DatabaseMcpAuditEvent[] = [];
    const config = testConfig();
    beforeAll(async () => {
        if (!basedir) throw new Error('MCP_TEST_MARIADB_BASEDIR is required');
        directory = await mkdtemp(join(tmpdir(), 'meteoric-mcp-test-'));
        const listener = createServer();
        await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
        const address = listener.address();
        if (!address || typeof address === 'string') throw new Error('port');
        port = address.port;
        await new Promise<void>((resolve) => listener.close(() => resolve()));
        execFileSync(
            join(basedir, 'bin/mariadb-install-db'),
            [
                '--no-defaults',
                `--basedir=${basedir}`,
                `--datadir=${directory}`,
                '--auth-root-authentication-method=normal',
                '--skip-test-db'
            ],
            { stdio: 'pipe', timeout: 60000 }
        );
        process = spawn(
            join(basedir, 'bin/mariadbd'),
            [
                '--no-defaults',
                `--basedir=${basedir}`,
                `--datadir=${directory}`,
                `--socket=${directory}/test.sock`,
                `--port=${port}`,
                '--bind-address=127.0.0.1',
                `--pid-file=${directory}/test.pid`,
                `--log-error=${directory}/test.log`,
                '--innodb-buffer-pool-size=32M'
            ],
            { stdio: 'ignore' }
        );
        for (let attempt = 0; attempt < 100; attempt++) {
            try {
                admin = await mysql.createConnection({ socketPath: `${directory}/test.sock`, user: 'root', connectTimeout: 200 });
                break;
            } catch {
                await delay(100);
            }
        }
        if (!admin) throw new Error('Disposable MariaDB failed to start');
        for (const sql of [
            'CREATE DATABASE mcp_test',
            'CREATE TABLE mcp_test.titles (id INT PRIMARY KEY, title TEXT, type VARCHAR(20), provider_id INT, password VARCHAR(100))',
            'CREATE TABLE mcp_test.providers (id INT PRIMARY KEY, name VARCHAR(100))',
            "INSERT INTO mcp_test.providers VALUES (1, 'Example Provider')",
            "INSERT INTO mcp_test.titles VALUES (1, 'One', 'movie', 1, 'hidden-secret'), (2, 'Two', 'series', 1, 'hidden-secret'), (3, 'Three', 'movie', 1, 'hidden-secret')",
            "CREATE USER 'reader'@'127.0.0.1' IDENTIFIED BY 'test-only-password'",
            "CREATE USER 'limited'@'127.0.0.1' IDENTIFIED BY 'test-only-password'",
            "GRANT SELECT (id,title,type,provider_id) ON mcp_test.titles TO 'reader'@'127.0.0.1'",
            "GRANT SELECT (id,name) ON mcp_test.providers TO 'reader'@'127.0.0.1'",
            "GRANT SELECT (id) ON mcp_test.providers TO 'limited'@'127.0.0.1'"
        ])
            await admin.query(sql);
        for (const profile of Object.values(config.profiles)) profile.connection.port = port;
        config.limits.maxRows = 2;
        service = await startDatabaseMcpServer(config, {
            audit: (event) => {
                events.push(event);
            }
        });
    }, 90000);
    afterAll(async () => {
        await Promise.allSettled(clients.map((client) => client.close()));
        await service?.close();
        await admin?.end();
        if (process?.exitCode === null) {
            process.kill('SIGTERM');
            await new Promise<void>((resolve) => process.once('exit', () => resolve()));
        }
        if (directory) await rm(directory, { recursive: true, force: true });
    });
    async function connect(token = testToken): Promise<Client> {
        const client = new Client({ name: 'integration-test', version: '1.0.0' });
        clients.push(client);
        await client.connect(
            new StreamableHTTPClientTransport(new URL(service.url), {
                requestInit: { headers: { Authorization: `Bearer ${token}` } }
            }) as Transport
        );
        return client;
    }
    it('supports initialization, discovery, schemas, joins and truncation through the official SDK', async () => {
        const client = await connect();
        expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(['list_tables', 'describe_table', 'query']);
        const schema = await client.callTool({ name: 'describe_table', arguments: { table: 'titles' } });
        expect(JSON.stringify(schema)).toContain('provider_id');
        expect(JSON.stringify(schema)).not.toContain('password');
        const result = await client.callTool({
            name: 'query',
            arguments: { sql: 'SELECT t.id, p.name FROM titles t JOIN providers p ON t.provider_id = p.id ORDER BY t.id' }
        });
        expect(result.isError).not.toBe(true);
        expect(JSON.stringify(result)).toContain('Example Provider');
        expect(JSON.stringify(result)).toContain('truncated');
        const content = result.content as Array<{ text: string }>;
        expect(JSON.parse(content[0]!.text)).toMatchObject({
            rows: [
                [1, 'Example Provider'],
                [2, 'Example Provider']
            ],
            truncated: true
        });
    });
    it('supports aggregates with column-level database grants', async () => {
        const client = await connect();
        const aggregate = await client.callTool({
            name: 'query',
            arguments: { sql: 'SELECT type, COUNT(*) AS total FROM titles GROUP BY type ORDER BY type' }
        });
        expect(aggregate.isError).not.toBe(true);
        expect(JSON.parse((aggregate.content as Array<{ text: string }>)[0]!.text).rows).toEqual([
            ['movie', '2'],
            ['series', '1']
        ]);
    });
    it('separates identities and denies restricted reads and writes', async () => {
        const client = await connect(secondToken);
        expect(JSON.stringify(await client.callTool({ name: 'list_tables' }))).not.toContain('titles');
        for (const sql of ['SELECT id FROM titles', 'SELECT name FROM providers', 'UPDATE providers SET id=2']) {
            expect((await client.callTool({ name: 'query', arguments: { sql } })).isError).toBe(true);
        }
        const connection = await mysql.createConnection(config.profiles.limited!.connection);
        try {
            await expect(connection.query('SELECT name FROM providers')).rejects.toThrow();
            await expect(connection.query('DELETE FROM providers')).rejects.toThrow();
        } finally {
            await connection.end();
        }
    });
    it('protects HTTP authentication, hosts, origins, methods and request sizes', async () => {
        expect((await fetch(service.url, { method: 'POST' })).status).toBe(401);
        expect(
            (
                await fetch(service.url, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${testToken}`, Origin: 'https://evil.example' }
                })
            ).status
        ).toBe(403);
        const badHostStatus = await new Promise<number | undefined>((resolve, reject) => {
            const request = httpRequest(
                service.url,
                { method: 'POST', headers: { Authorization: `Bearer ${testToken}`, Host: 'evil.example' } },
                (response) => {
                    response.resume();
                    resolve(response.statusCode);
                }
            );
            request.on('error', reject);
            request.end();
        });
        expect(badHostStatus).toBe(403);
        expect((await fetch(service.url, { headers: { Authorization: `Bearer ${testToken}` } })).status).toBe(405);
        expect(
            (
                await fetch(service.url, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${testToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ padding: 'x'.repeat(66000) })
                })
            ).status
        ).toBe(400);
    });
    it('does not expose query literals, rows, credentials, or raw DB errors in audit events', async () => {
        const client = await connect();
        await client.callTool({ name: 'query', arguments: { sql: "SELECT id FROM titles WHERE title = 'private-search-value'" } });
        const serialized = JSON.stringify(events);
        expect(serialized).toContain('queryFingerprint');
        for (const secret of ['private-search-value', 'hidden-secret', testToken, 'test-only-password', 'Example Provider'])
            expect(serialized).not.toContain(secret);
    });
    it('enforces server-side execution timeout and destroys aborted connections', async () => {
        const reader = new MariaDbMcpReader(config.profiles.catalog!, { ...config.limits, queryTimeoutMs: 100 });
        await reader.initialize();
        try {
            const slow = { sql: 'SELECT SLEEP(10)', parameters: [], fingerprint: 'test', rowLimit: 1 };
            const started = Date.now();
            await expect(reader.query(slow, new AbortController().signal, (value) => value)).rejects.toThrow();
            expect(Date.now() - started).toBeLessThan(3000);
            await expect(reader.query(slow, AbortSignal.timeout(20), (value) => value)).rejects.toThrow();
            const query = compileDatabaseQuery('SELECT id FROM titles LIMIT 1', config.profiles.catalog!.tables, config.limits);
            expect((await reader.query(query, new AbortController().signal, createDatabaseMcpRedactor([]))).rows).toEqual([[1]]);
        } finally {
            await reader.close();
        }
    }, 10000);
    it('rechecks privileges after startup and refuses a newly writable account', async () => {
        await admin.query("GRANT UPDATE ON mcp_test.titles TO 'reader'@'127.0.0.1'");
        try {
            const client = await connect();
            expect((await client.callTool({ name: 'query', arguments: { sql: 'SELECT id FROM titles' } })).isError).toBe(true);
            const reader = new MariaDbMcpReader(config.profiles.catalog!, config.limits);
            try {
                await expect(reader.initialize()).rejects.toThrow('only');
            } finally {
                await reader.close();
            }
        } finally {
            await admin.query("REVOKE UPDATE ON mcp_test.titles FROM 'reader'@'127.0.0.1'");
        }
    });
    it('bounds escaped result bytes and leaves the reader usable after truncation', async () => {
        await admin.execute('INSERT INTO mcp_test.titles VALUES (50, ?, ?, 1, ?)', ['\\"'.repeat(20000), 'movie', 'hidden-secret']);
        const limits = { ...config.limits, maxBytes: 16384 };
        const reader = new MariaDbMcpReader(config.profiles.catalog!, limits);
        await reader.initialize();
        try {
            const compiled = compileDatabaseQuery('SELECT title FROM titles WHERE id = 50', config.profiles.catalog!.tables, limits);
            const result = await reader.query(compiled, new AbortController().signal, createDatabaseMcpRedactor([]));
            expect(result).toMatchObject({ rows: [], truncated: true });
            const normal = compileDatabaseQuery('SELECT id FROM titles WHERE id = 1', config.profiles.catalog!.tables, limits);
            expect((await reader.query(normal, new AbortController().signal, createDatabaseMcpRedactor([]))).rows).toEqual([[1]]);
        } finally {
            await reader.close();
        }
    });
    it('binds escaped title literals with their intended value', async () => {
        await admin.execute('INSERT INTO mcp_test.titles VALUES (51, ?, ?, 1, ?)', ["Schindler's List", 'movie', 'hidden-secret']);
        const client = await connect();
        const result = await client.callTool({
            name: 'query',
            arguments: { sql: String.raw`SELECT id FROM titles WHERE title = 'Schindler\'s List'` }
        });
        expect(result.isError).not.toBe(true);
        expect(JSON.parse((result.content as Array<{ text: string }>)[0]!.text).rows).toEqual([[51]]);
    });
    it('requires an exact schema for approved views', async () => {
        await admin.query('CREATE VIEW mcp_test.safe_titles AS SELECT id, title FROM mcp_test.titles');
        await admin.query("CREATE USER 'view_reader'@'127.0.0.1' IDENTIFIED BY 'test-only-password'");
        await admin.query("GRANT SELECT ON mcp_test.safe_titles TO 'view_reader'@'127.0.0.1'");
        const profile = {
            connection: { ...config.profiles.catalog!.connection, user: 'view_reader' },
            tables: { safe_titles: { kind: 'view' as const, columns: ['id'] } }
        };
        const incomplete = new MariaDbMcpReader(profile, config.limits);
        try {
            await expect(incomplete.initialize()).rejects.toThrow('schema');
        } finally {
            await incomplete.close();
        }
        profile.tables.safe_titles.columns.push('title');
        const complete = new MariaDbMcpReader(profile, config.limits);
        try {
            await expect(complete.initialize()).resolves.toBeUndefined();
        } finally {
            await complete.close();
        }
    });
});
