import { describe, expect, it } from 'vitest';
import { parseDatabaseMcpConfig } from '../../src/mcp/database/config.js';
import { createDatabaseMcpAuthenticator } from '../../src/mcp/database/auth.js';
import { assertDatabaseMcpGrants } from '../../src/mcp/database/mariadb.js';
import { createDatabaseMcpRedactor } from '../../src/mcp/database/redaction.js';
import { testConfig, testToken } from './fixtures.js';

describe('database MCP boundaries', () => {
    it('requires explicit expiring identities and rejects missing, wrong and expired tokens', async () => {
        const config = testConfig();
        const authenticate = createDatabaseMcpAuthenticator(config.auth);
        expect(await authenticate(`Bearer ${testToken}`)).toEqual({ id: 'local', profile: 'catalog' });
        expect(await authenticate(undefined)).toBeNull();
        expect(await authenticate(`Bearer ${testToken}x`)).toBeNull();
        expect(await authenticate(`Basic ${testToken}`)).toBeNull();
        if (config.auth.type !== 'bearer') throw new Error('fixture');
        config.auth.tokens[0]!.expiresAt = '2000-01-01T00:00:00.000Z';
        expect(await authenticate(`Bearer ${testToken}`)).toBeNull();
    });
    it('validates profile bindings and does not expose invalid secret values', () => {
        const config = testConfig();
        if (config.auth.type !== 'bearer') throw new Error('fixture');
        config.auth.tokens[0]!.profile = 'missing';
        expect(() => parseDatabaseMcpConfig(config)).toThrow('auth');
        config.profiles.catalog!.connection.password = '';
        expect(() => parseDatabaseMcpConfig(config)).not.toThrow(testToken);
    });
    it('requires TLS off loopback and HTTPS for deployment', () => {
        const config = testConfig();
        config.profiles.catalog!.connection.host = 'db.internal';
        expect(() => parseDatabaseMcpConfig(config)).toThrow('tls');
        config.profiles.catalog!.connection.tls = {};
        expect(() => parseDatabaseMcpConfig(config)).not.toThrow();
        config.environment = 'production';
        expect(() => parseDatabaseMcpConfig(config)).toThrow('publicUrl');
    });
    it('accepts only explicit column grants', () => {
        expect(() =>
            assertDatabaseMcpGrants(
                [
                    "GRANT USAGE ON *.* TO `reader`@`localhost` IDENTIFIED BY PASSWORD '*not-logged'",
                    'GRANT SELECT (`id`, `title`, `type`, `provider_id`) ON `mcp_test`.`titles` TO `reader`@`localhost`',
                    'GRANT SELECT (`id`, `name`) ON `mcp_test`.`providers` TO `reader`@`localhost`'
                ],
                testConfig().profiles.catalog!
            )
        ).not.toThrow();
    });
    it.each([
        'GRANT SELECT, INSERT ON `mcp_test`.`titles` TO `reader`@`localhost`',
        'GRANT SELECT ON `mcp_test`.* TO `reader`@`localhost`',
        'GRANT SELECT ON *.* TO `reader`@`localhost`',
        'GRANT SELECT ON `mcp_test`.`titles` TO `reader`@`localhost`',
        'GRANT SELECT (`password`) ON `mcp_test`.`titles` TO `reader`@`localhost`',
        'GRANT SELECT (`id`) ON `other`.`titles` TO `reader`@`localhost`',
        'GRANT SELECT (`id`) ON `mcp_test`.`users` TO `reader`@`localhost`',
        'GRANT SELECT (`id`) ON `mcp_test`.`titles` TO `reader`@`localhost` WITH GRANT OPTION',
        'GRANT EXECUTE ON PROCEDURE `mcp_test`.`write_data` TO `reader`@`localhost`',
        'GRANT `admin` TO `reader`@`localhost`',
        'SET DEFAULT ROLE `admin` FOR `reader`@`localhost`'
    ])('refuses excessive grants without echoing credentials: %s', (grant) => {
        expect(() => assertDatabaseMcpGrants([grant], testConfig().profiles.catalog!)).toThrow('only');
    });
    it('permits table-level SELECT only for declared views', () => {
        const profile = testConfig().profiles.catalog!;
        profile.tables.titles!.kind = 'view';
        expect(() => assertDatabaseMcpGrants(['GRANT SELECT ON `mcp_test`.`titles` TO `reader`@`localhost`'], profile)).not.toThrow();
    });
    it('redacts nested JSON, configured keys, email text and binary content', () => {
        const redact = createDatabaseMcpRedactor(['private_note']);
        expect(redact('{"user":{"hashedPassword":"hash","name":"A","private_note":"secret"}}')).toBe(
            '{"user":{"hashedPassword":"[REDACTED]","name":"A","private_note":"[REDACTED]"}}'
        );
        expect(redact('Contact test@example.com')).toBe('Contact [REDACTED EMAIL]');
        expect(redact(Buffer.from('secret'))).toBe('[BINARY OMITTED]');
    });
});
