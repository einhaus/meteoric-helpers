const sensitiveKeys = [
    'password',
    'hashedpassword',
    'passwd',
    'secret',
    'token',
    'accesstoken',
    'refreshtoken',
    'apikey',
    'authorization',
    'cookie',
    'email',
    'username',
    'phone',
    'ssn'
];
const normalize = (key: string): string => key.replace(/[_-]/g, '').toLowerCase();

/** Defense in depth for approved data. Column permissions, not these heuristics, protect confidential fields. */
export function createDatabaseMcpRedactor(extraKeys: string[]): (value: unknown, key?: string) => unknown {
    const keys = new Set([...sensitiveKeys, ...extraKeys.map(normalize)]);
    const walk = (value: unknown, key = '', depth = 0): unknown => {
        if (keys.has(normalize(key)) || depth > 12) return '[REDACTED]';
        if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
        if (typeof value === 'bigint') return value.toString();
        if (Buffer.isBuffer(value)) return '[BINARY OMITTED]';
        if (typeof value === 'string') {
            if (/^\s*[[{]/.test(value)) {
                try {
                    return JSON.stringify(walk(JSON.parse(value) as unknown, '', depth + 1));
                } catch {
                    /* Plain text. */
                }
            }
            return value.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED EMAIL]');
        }
        if (Array.isArray(value)) return value.map((item) => walk(item, '', depth + 1));
        if (typeof value === 'object')
            return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, walk(item, name, depth + 1)]));
        return null;
    };
    return walk;
}
