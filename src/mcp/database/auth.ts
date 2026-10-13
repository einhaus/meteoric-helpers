import { createHash, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { DatabaseMcpConfig } from './config.js';

export interface DatabaseMcpPrincipal {
    id: string;
    profile: string;
}

export function createDatabaseMcpAuthenticator(
    auth: DatabaseMcpConfig['auth']
): (header: string | undefined) => Promise<DatabaseMcpPrincipal | null> {
    const jwks = auth.type === 'oauth' ? createRemoteJWKSet(new URL(auth.jwksUrl), { timeoutDuration: 3000 }) : undefined;
    return async (header) => {
        if (!header || !/^Bearer [A-Za-z0-9._~+/-]+=*$/i.test(header) || header.length > 8192) return null;
        const bearer = header.slice(7);
        if (auth.type === 'bearer') {
            if (bearer.length < 32) return null;
            const hash = createHash('sha256').update(bearer).digest();
            const token = auth.tokens.find((candidate) => timingSafeEqual(hash, Buffer.from(candidate.sha256, 'hex')));
            return token && Date.parse(token.expiresAt) > Date.now() ? { id: token.id, profile: token.profile } : null;
        }
        try {
            if (!jwks) return null;
            const { payload } = await jwtVerify(bearer, jwks, {
                issuer: auth.issuer,
                audience: auth.audience,
                algorithms: ['RS256', 'ES256'],
                requiredClaims: ['sub', 'exp', 'iat'],
                clockTolerance: 5
            });
            if (
                typeof payload.sub !== 'string' ||
                typeof payload.scope !== 'string' ||
                !payload.scope.split(' ').includes(auth.requiredScope)
            )
                return null;
            const profile = Object.hasOwn(auth.subjects, payload.sub) ? auth.subjects[payload.sub] : undefined;
            return profile ? { id: payload.sub, profile } : null;
        } catch {
            return null;
        }
    };
}
