import { z } from 'zod';

const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/);
const httpsUrl = z.url().refine((value) => new URL(value).protocol === 'https:', 'HTTPS is required');
const tableSchema = z.strictObject({
    kind: z.enum(['table', 'view']).default('table'),
    columns: z.array(identifier).min(1).max(100)
});

export const databaseMcpProfileSchema = z.strictObject({
    connection: z.strictObject({
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535).default(3306),
        database: identifier,
        user: z.string().min(1),
        password: z.string().min(1),
        tls: z.strictObject({ ca: z.string().min(1).optional() }).optional()
    }),
    tables: z.record(identifier, tableSchema).refine((tables) => Object.keys(tables).length > 0, 'At least one table is required')
});

export const databaseMcpConfigSchema = z
    .strictObject({
        name: identifier,
        environment: z.enum(['development', 'staging', 'production']),
        publicUrl: z.url().refine((value) => {
            const url = new URL(value);
            return (
                !url.username &&
                !url.password &&
                !url.search &&
                !url.hash &&
                url.pathname === '/mcp' &&
                (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
            );
        }, 'Use an HTTPS /mcp URL (HTTP is allowed only on loopback)'),
        port: z.number().int().min(0).max(65535).default(8095),
        profiles: z.record(identifier, databaseMcpProfileSchema).refine((profiles) => Object.keys(profiles).length > 0),
        auth: z.discriminatedUnion('type', [
            z.strictObject({
                type: z.literal('bearer'),
                tokens: z
                    .array(
                        z.strictObject({
                            id: identifier,
                            sha256: z.string().regex(/^[a-f0-9]{64}$/),
                            profile: identifier,
                            expiresAt: z.iso.datetime()
                        })
                    )
                    .min(1)
                    .max(100)
            }),
            z.strictObject({
                type: z.literal('oauth'),
                issuer: httpsUrl,
                jwksUrl: httpsUrl,
                audience: httpsUrl,
                requiredScope: z
                    .string()
                    .regex(/^[A-Za-z0-9_:.-]+$/)
                    .default('database:read'),
                subjects: z.record(z.string().min(1), identifier).refine((subjects) => Object.keys(subjects).length > 0)
            })
        ]),
        limits: z
            .strictObject({
                maxRows: z.number().int().min(1).max(1000).default(200),
                maxBytes: z.number().int().min(16384).max(1048576).default(262144),
                queryTimeoutMs: z.number().int().min(100).max(30000).default(5000),
                maxConcurrentQueries: z.number().int().min(1).max(8).default(2),
                requestsPerMinute: z.number().int().min(1).max(600).default(60)
            })
            .default({ maxRows: 200, maxBytes: 262144, queryTimeoutMs: 5000, maxConcurrentQueries: 2, requestsPerMinute: 60 }),
        redactKeys: z.array(identifier).max(100).default([])
    })
    .superRefine((config, ctx) => {
        const profiles =
            config.auth.type === 'bearer' ? config.auth.tokens.map((token) => token.profile) : Object.values(config.auth.subjects);
        if (profiles.some((profile) => !Object.hasOwn(config.profiles, profile))) {
            ctx.addIssue({ code: 'custom', message: 'Authentication references an unknown profile', path: ['auth'] });
        }
        if (config.auth.type === 'bearer') {
            for (const field of ['id', 'sha256'] as const) {
                if (new Set(config.auth.tokens.map((token) => token[field])).size !== config.auth.tokens.length) {
                    ctx.addIssue({ code: 'custom', message: 'Token IDs and hashes must be unique', path: ['auth', 'tokens'] });
                }
            }
        } else if (config.auth.audience !== config.publicUrl) {
            ctx.addIssue({ code: 'custom', message: 'OAuth audience must equal publicUrl', path: ['auth', 'audience'] });
        }
        if (config.environment !== 'development' && new URL(config.publicUrl).protocol !== 'https:') {
            ctx.addIssue({ code: 'custom', message: 'Deployed endpoints require HTTPS', path: ['publicUrl'] });
        }
        for (const [name, profile] of Object.entries(config.profiles)) {
            if (!['localhost', '127.0.0.1', '::1'].includes(profile.connection.host) && !profile.connection.tls) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'Remote database connections require TLS',
                    path: ['profiles', name, 'connection', 'tls']
                });
            }
            for (const [table, policy] of Object.entries(profile.tables)) {
                if (new Set(policy.columns.map((column) => column.toLowerCase())).size !== policy.columns.length) {
                    ctx.addIssue({ code: 'custom', message: 'Duplicate columns', path: ['profiles', name, 'tables', table] });
                }
            }
        }
    });

export type DatabaseMcpConfig = z.infer<typeof databaseMcpConfigSchema>;
export type DatabaseMcpConfigInput = z.input<typeof databaseMcpConfigSchema>;
export type DatabaseMcpProfile = z.infer<typeof databaseMcpProfileSchema>;
export type DatabaseMcpLimits = DatabaseMcpConfig['limits'];

/** Deliberately omits Zod input values and driver errors, which can contain credentials. */
export function parseDatabaseMcpConfig(input: unknown): DatabaseMcpConfig {
    const parsed = databaseMcpConfigSchema.safeParse(input);
    if (!parsed.success) {
        throw new Error(
            `Invalid database MCP configuration: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`
        );
    }
    return parsed.data;
}

export class DatabaseMcpError extends Error {
    constructor(
        public readonly code: 'denied' | 'busy' | 'query_failed' | 'cancelled' | 'unavailable',
        message: string
    ) {
        super(message);
    }
}

export interface DatabaseMcpAuditEvent {
    timestamp: string;
    requestId: string;
    project: string;
    environment: string;
    principal: string;
    profile: string;
    tool: string;
    outcome: 'allowed' | 'denied' | 'failed';
    durationMs: number;
    queryFingerprint?: string;
    rows?: number;
    bytes?: number;
    code?: string;
}
