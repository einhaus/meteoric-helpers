import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createDatabaseMcpAuthenticator } from '../../src/mcp/database/auth.js';
import type { DatabaseMcpConfig } from '../../src/mcp/database/config.js';

const resolver = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock('jose', async (importOriginal) => ({
    ...(await importOriginal<typeof import('jose')>()),
    createRemoteJWKSet: () => resolver.value
}));

describe('OAuth access token verification', () => {
    let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
    const auth: DatabaseMcpConfig['auth'] = {
        type: 'oauth',
        issuer: 'https://auth.example.com',
        audience: 'https://db.example.com/mcp',
        jwksUrl: 'https://auth.example.com/jwks',
        requiredScope: 'database:read',
        subjects: { approved: 'catalog' }
    };
    beforeAll(async () => {
        const keys = await generateKeyPair('ES256');
        privateKey = keys.privateKey;
        resolver.value = createLocalJWKSet({ keys: [await exportJWK(keys.publicKey)] });
    });
    async function token(overrides: Record<string, unknown> = {}): Promise<string> {
        return new SignJWT({
            iss: auth.issuer,
            aud: auth.audience,
            sub: 'approved',
            scope: 'database:read',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 60,
            ...overrides
        })
            .setProtectedHeader({ alg: 'ES256' })
            .sign(privateKey);
    }
    it('uses the verified subject to select a configured profile', async () => {
        expect(await createDatabaseMcpAuthenticator(auth)(`Bearer ${await token({ profile: 'admin' })}`)).toEqual({
            id: 'approved',
            profile: 'catalog'
        });
    });
    it.each([
        { iss: 'https://other.example.com' },
        { aud: 'https://other-project.example.com/mcp' },
        { sub: 'unknown' },
        { scope: 'database:write' },
        { exp: 1 },
        { nbf: 9999999999 },
        { iat: undefined }
    ])('rejects tokens with invalid claims %j', async (claims) => {
        expect(await createDatabaseMcpAuthenticator(auth)(`Bearer ${await token(claims)}`)).toBeNull();
    });
    it('rejects a token signed by a different key', async () => {
        const keys = await generateKeyPair('ES256');
        const signed = await new SignJWT({ iss: auth.issuer, aud: auth.audience, sub: 'approved', scope: 'database:read' })
            .setProtectedHeader({ alg: 'ES256' })
            .setIssuedAt()
            .setExpirationTime('1m')
            .sign(keys.privateKey);
        expect(await createDatabaseMcpAuthenticator(auth)(`Bearer ${signed}`)).toBeNull();
    });
});
