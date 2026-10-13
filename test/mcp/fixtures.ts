import { createHash } from 'node:crypto';
import { parseDatabaseMcpConfig, type DatabaseMcpConfig } from '../../src/mcp/database/config.js';

export const testToken = 'test-only-token-012345678901234567890123456789';
export const secondToken = 'test-only-other-012345678901234567890123456789';
export function testConfig(): DatabaseMcpConfig {
    return parseDatabaseMcpConfig({
        name: 'test_database',
        environment: 'development',
        publicUrl: 'http://127.0.0.1:0/mcp',
        port: 0,
        profiles: {
            catalog: {
                connection: { host: '127.0.0.1', database: 'mcp_test', user: 'reader', password: 'test-only-password' },
                tables: {
                    titles: { columns: ['id', 'title', 'type', 'provider_id'] },
                    providers: { columns: ['id', 'name'] }
                }
            },
            limited: {
                connection: { host: '127.0.0.1', database: 'mcp_test', user: 'limited', password: 'test-only-password' },
                tables: {
                    providers: { columns: ['id'] }
                }
            }
        },
        auth: {
            type: 'bearer',
            tokens: [
                {
                    id: 'local',
                    profile: 'catalog',
                    sha256: createHash('sha256').update(testToken).digest('hex'),
                    expiresAt: '2099-01-01T00:00:00.000Z'
                },
                {
                    id: 'cloud',
                    profile: 'limited',
                    sha256: createHash('sha256').update(secondToken).digest('hex'),
                    expiresAt: '2099-01-01T00:00:00.000Z'
                }
            ]
        }
    });
}
