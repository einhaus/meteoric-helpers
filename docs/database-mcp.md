# Database MCP

The public ESM entry point is `@einhaus/meteoric-helpers/mcp/database`. Importing it does not start a listener or open database connections. It is excluded from the generated browser and Node barrel files.

```ts
import { startDatabaseMcpServer } from '@einhaus/meteoric-helpers/mcp/database';

const service = await startDatabaseMcpServer(config, {
    audit: async (event) => {
        await auditWriter.write(event);
    }
});
// On SIGTERM/SIGINT:
await service.close();
```

## Configuration and identities

Use `DatabaseMcpConfigInput` or `databaseMcpConfigSchema` for the configuration contract. The server accepts only validated configuration. It binds to `127.0.0.1`; remote access requires an HTTPS reverse proxy that preserves Host and POST bodies. `publicUrl` must end in `/mcp`. Origin, when supplied, must match its origin. HTTP is permitted only for development on loopback.

Each named profile supplies a dedicated MariaDB connection and an explicit mapping of tables to approved columns. Connections to non-loopback hosts require verified TLS. No credentials come from the general database helper or environment implicitly. The server currently requires MariaDB; it does not silently use MySQL or PostgreSQL semantics.

Authentication supports:

- `bearer`: unique identity IDs, SHA-256 hashes of random tokens of at least 32 characters, a profile name, and mandatory expiration timestamps. Generate tokens from at least 32 cryptographically random bytes. Only token hashes belong in the server configuration. Remove an identity or rotate its hash and restart to revoke it; expiration is enforced on every request.
- `oauth`: an HTTPS issuer, pinned JWKS URL, audience equal to `publicUrl`, required scope (default `database:read`), and a map from verified token subjects to profiles. JWT signatures must use RS256 or ES256; issuer, audience, expiration, issued-at presence, scope, and subject are checked. The service exposes OAuth protected-resource metadata at `/.well-known/oauth-protected-resource`. Use an existing compliant OAuth authorization server for login, client registration and token issuance. This module is a resource server, not an authorization server. Opaque OAuth tokens are unsupported.

Use different database accounts for profiles with different permissions. A caller cannot select a profile, database, host, or credential through a tool argument. Both authentication methods support unattended clients with suitable credentials; actual client OAuth discovery and registration depend on the configured authorization server.

## Database permissions

Startup verifies `SHOW GRANTS FOR CURRENT_USER` and checks schema metadata. It rejects global/schema SELECT, write privileges, routine privileges, roles, grant options, and grants outside the configured tables/columns. Grants are checked again before each query. The contents of SHOW GRANTS can contain password hashes and are never logged or returned.

For a base table, grant SELECT on explicit columns:

```sql
GRANT SELECT (id, title, release_date) ON catalog.titles TO 'agent_catalog'@'mcp-host';
```

For a reviewed view, declare `kind: 'view'` and grant SELECT on that view. The configured columns must exactly match its visible columns. Views are the boundary for row/tenant restrictions and precomputed masking. Review their definitions and use a narrowly privileged, read-only definer; a view must not invoke routines that can write. The service does not infer tenant ownership or rewrite arbitrary row policies. Expanding grants or changing views requires an explicit review.

Users with local shell access to other application credentials still have those capabilities outside MCP. Deployment must isolate the MCP OS/workload identity and secrets; a separate process alone does not isolate a shared instance role or filesystem.

## Tools and supported SQL

- `list_tables`: approved table names only.
- `describe_table`: approved column names, data types and nullability. No comments, defaults, or hidden columns.
- `query`: a single SELECT using explicit columns. Joins with ON conditions, aggregates, filters, GROUP BY, HAVING, ORDER BY, DISTINCT and bounded LIMIT/OFFSET are supported. COUNT(*) is allowed; other wildcards are refused.

The parser's AST is validated and reconstructed into SQL with bound values. The original SQL text is never executed. Queries cannot reference other schemas, hidden columns (including in filters/joins), variables, arbitrary functions, files, locks, or writes. CTEs, subqueries, UNION, window functions, comments/hints, CAST and other unsupported syntax fail closed. Extend supported syntax deliberately, with bypass tests. Safe function names are explicitly enumerated in `query.ts`.

Supply large integer IDs and high-precision decimal filter values as quoted strings. Big-integer literals and decimal literals with more than 15 significant digits are rejected to avoid parser precision loss.

Defaults are 200 returned rows, 256 KiB result payloads, a five-second database statement timeout, two concurrent queries across the service, and 60 HTTP requests per minute per identity. Initialization and discovery count toward the request limit. Requests are limited to 64 KiB and SQL to 16 KiB. Results use column names plus row arrays, avoiding ambiguous duplicate column keys, and explicitly report truncation.

Queries run in read-only transactions. A server-side MariaDB timeout is combined with a client deadline and connection destruction on cancellation or early truncation. Timers are not instantaneous workload guarantees. Large scans or individual values can consume database/driver resources before limits take effect; use a replica or isolated read database for heavy exploration and additional database resource limits as needed. Schema descriptions are a startup snapshot; restart after approved schema changes.

Sensitive key names, embedded JSON keys, email-shaped text and binary data receive additional output redaction. This is defense in depth. Never grant access to raw sensitive columns and rely on heuristic redaction to make arbitrary expressions safe.

## Audit and lifecycle

The required audit callback receives identity, profile, project, environment, tool, timing, result counts, policy outcome and a hash of reconstructed parameterized SQL. It never receives SQL literals, results, tokens, raw driver errors or grants. It records validated tool invocations; HTTP authentication/transport failures should also be counted in the reverse proxy's sanitized access log. Never log Authorization headers or request/response bodies there.

A failed audit sink withholds the tool result and disables subsequent access until restart. `close()` stops the listener, aborts active requests and closes connection pools. There is no database connection registry shared with the application, no import-time server startup, and no mutation tool.

## Verification

```sh
bun run type-check
bun run lint
bun run test
MCP_TEST_MARIADB_BASEDIR=/path/to/mariadb bun run test test/mcp
```

The optional integration suite starts its own MariaDB process with `--no-defaults`, a temporary data directory, a Unix socket and a free loopback port. It creates only synthetic data and test accounts, exercises the official MCP HTTP client, checks real database denials and cancellation, and removes its own data directory. Never point a test at a production data directory. The default suite covers SQL attacks, grants, OAuth signatures/claims, identity isolation, HTTP limits and audit failures without a database.
