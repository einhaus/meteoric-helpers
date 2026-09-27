import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateTypesPg } from '../../src/db/generateTypesPg.js';
import { DBPostgres } from '../../src/db/postgres.js';

type CatalogRow = Record<string, unknown>;

const column = (column_name: string, data_type: string, overrides: Partial<CatalogRow> = {}): CatalogRow => ({
    column_name,
    data_type,
    udt_name: data_type,
    is_nullable: 'NO',
    column_default: null,
    character_maximum_length: null,
    ...overrides
});

const primaryKeyIndex = (table_name: string, column_name: string): CatalogRow => ({
    table_name,
    index_name: `${table_name}_pkey`,
    column_name,
    is_unique: true,
    is_primary: true
});

const columnsByTable: Record<string, CatalogRow[]> = {
    audit_counters: [column('name', 'text'), column('hits', 'bigint')],
    ledger_entries: [
        column('id', 'bigint', { column_default: "nextval('ledger_entries_id_seq'::regclass)" }),
        column('user_id', 'bigint', { is_nullable: 'YES' }),
        column('tag_ids', 'ARRAY', { udt_name: '_int8', is_nullable: 'YES' }),
        column('amount_cents', 'bigint'),
        column('position', 'integer')
    ],
    settings: [column('key', 'text'), column('value', 'jsonb')],
    user_roles: [column('user_id', 'bigint'), column('role', 'text')]
};

const indexRows = [
    primaryKeyIndex('ledger_entries', 'id'),
    primaryKeyIndex('user_roles', 'user_id'),
    primaryKeyIndex('user_roles', 'role')
];

const catalogQuery = async ({ queryString, parameters }: { queryString: string; parameters?: unknown[] }) => {
    if (queryString.includes('pg_enum')) return { rows: [] };
    if (queryString.includes('information_schema.columns')) {
        const rows = columnsByTable[String(parameters?.[0])];
        if (!rows) throw new Error(`Unexpected table: ${String(parameters?.[0])}`);
        return { rows };
    }
    if (queryString.includes('pg_index')) return { rows: indexRows };
    if (queryString.includes('pg_constraint')) return { rows: [] };
    if (queryString.includes('pg_description')) return { rows: [] };
    if (queryString.includes('ORDER BY c.relname')) return { rows: Object.keys(columnsByTable).map((table_name) => ({ table_name })) };

    throw new Error(`Unexpected catalog query: ${queryString}`);
};

describe('generateTypesPg', () => {
    const tempDirs: string[] = [];

    afterEach(() => {
        for (const dir of tempDirs.splice(0)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }

        vi.restoreAllMocks();
    });

    it('emits scalar int8 columns as bigintColumns in the Bun schema metadata', async () => {
        const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'generate-types-pg-'));
        tempDirs.push(outputDir);
        const outputPath = path.join(outputDir, 'dbTypes.ts');
        const closeConnection = vi.fn(async () => {});

        vi.spyOn(DBPostgres, 'getInstance').mockReturnValue({ doQuery: catalogQuery, closeConnection } as unknown as DBPostgres);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        // The generator reports failures through console.error instead of throwing.
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        await generateTypesPg({
            host: 'localhost',
            user: 'test',
            password: 'test',
            db: 'test',
            logFolder: outputDir,
            outputPath,
            bunTypesImportPath: '@einhaus/meteoric-helpers'
        });

        expect(consoleError).not.toHaveBeenCalled();
        expect(closeConnection).toHaveBeenCalledTimes(1);

        const output = fs.readFileSync(outputPath, 'utf8');

        expect(output).toContain(
            [
                'export const DatabaseBunSchemaMetadata = {',
                "    audit_counters: { bigintColumns: ['hits'] },",
                "    ledger_entries: { primaryKey: 'id', bigintColumns: ['id', 'user_id', 'amount_cents'] },",
                '    settings: {},',
                "    user_roles: { primaryKey: ['user_id', 'role'], bigintColumns: ['user_id'] },",
                '} as const satisfies BunDbRuntimeSchemaMetadata<DatabaseBunSchema>;'
            ].join('\n')
        );
        expect(output).toContain('  id: number;');
        expect(output).toContain('  user_id: number | null;');
    });
});
