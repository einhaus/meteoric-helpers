/* eslint-disable @typescript-eslint/naming-convention */
import type { ResultSetHeader } from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { DBMysql } from './mysql.js';

export interface GenerateRustTypesMysqlOptions {
    host: string;
    user: string;
    password: string;
    db: string;
    logFolder: string;
    outputPath: string;
    manifestOutputPath?: string;
    schemaOverridesPath?: string;
}

interface MysqlColumnManifest {
    columnName: string;
    dataType: string;
    columnType: string;
    isNullable: boolean;
    columnDefault: string | null;
    columnComment: string;
    ordinalPosition: number;
}

interface MysqlTableManifest {
    baseTableName: string;
    sourceTableName: string;
    isShardedFamily: boolean;
    columns: MysqlColumnManifest[];
}

interface MysqlSchemaManifest {
    generatedAt: string;
    databaseName: string;
    tables: MysqlTableManifest[];
}

interface RustSchemaOverrides {
    rust?: {
        columnTypeOverrides?: Record<string, string>;
    };
}

const RUST_RESERVED_IDENTIFIERS = new Set([
    'as',
    'break',
    'const',
    'continue',
    'crate',
    'else',
    'enum',
    'extern',
    'false',
    'fn',
    'for',
    'if',
    'impl',
    'in',
    'let',
    'loop',
    'match',
    'mod',
    'move',
    'mut',
    'pub',
    'ref',
    'return',
    'self',
    'Self',
    'static',
    'struct',
    'super',
    'trait',
    'true',
    'type',
    'unsafe',
    'use',
    'where',
    'while',
    'async',
    'await',
    'dyn',
    'abstract',
    'become',
    'box',
    'do',
    'final',
    'macro',
    'override',
    'priv',
    'typeof',
    'unsized',
    'virtual',
    'yield',
    'try'
]);

function isShardedTable(tableName: string): boolean {
    return /^.+_\d+$/.test(tableName);
}

function getBaseTableName(tableName: string): string {
    return tableName.replace(/_\d+$/, '');
}

function ensureDirectoryExists(targetPath: string): void {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

function escapeRustStringLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

function toPascalCase(value: string): string {
    return value
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join('');
}

function toSnakeCase(value: string): string {
    const normalized = value
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    return normalized.toLowerCase();
}

function toSafeRustIdentifier(columnName: string): string {
    const snakeCase = toSnakeCase(columnName);
    const prefixedIdentifier = /^[0-9]/.test(snakeCase) ? `column_${snakeCase}` : snakeCase;

    if (RUST_RESERVED_IDENTIFIERS.has(prefixedIdentifier)) {
        return `${prefixedIdentifier}_field`;
    }

    return prefixedIdentifier;
}

function toUpperSnakeCase(value: string): string {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();
}

function readRustSchemaOverrides(schemaOverridesPath?: string): RustSchemaOverrides {
    if (!schemaOverridesPath || !fs.existsSync(schemaOverridesPath)) {
        return {};
    }

    const rawFile = fs.readFileSync(schemaOverridesPath, 'utf8').trim();

    if (rawFile.length === 0) {
        return {};
    }

    return JSON.parse(rawFile) as RustSchemaOverrides;
}

function resolveRustTypeOverride(
    overrides: RustSchemaOverrides,
    tableName: string,
    sourceTableName: string,
    columnName: string
): string | null {
    const columnTypeOverrides = overrides.rust?.columnTypeOverrides;

    if (!columnTypeOverrides) {
        return null;
    }

    const lookupKeys = [`${tableName}.${columnName}`, `${sourceTableName}.${columnName}`];

    for (const lookupKey of lookupKeys) {
        const overrideValue = columnTypeOverrides[lookupKey];

        if (typeof overrideValue === 'string' && overrideValue.length > 0) {
            return overrideValue;
        }
    }

    return null;
}

function wrapNullableRustType(typeName: string, isNullable: boolean): string {
    if (!isNullable) {
        return typeName;
    }

    if (typeName.startsWith('Option<')) {
        return typeName;
    }

    return `Option<${typeName}>`;
}

function mapMysqlColumnToRustType(table: MysqlTableManifest, column: MysqlColumnManifest, overrides: RustSchemaOverrides): string {
    const overrideType = resolveRustTypeOverride(overrides, table.baseTableName, table.sourceTableName, column.columnName);

    if (overrideType) {
        return wrapNullableRustType(overrideType, column.isNullable);
    }

    const normalizedDataType = column.dataType.toLowerCase();
    const normalizedColumnType = column.columnType.toLowerCase();
    const isUnsigned = normalizedColumnType.includes('unsigned');

    const isBooleanTinyInt =
        normalizedDataType === 'tinyint' &&
        /^tinyint\(1\)( unsigned)?$/i.test(column.columnType) &&
        column.columnComment.toLowerCase() === 'boolean';

    if (isBooleanTinyInt) {
        return wrapNullableRustType('bool', column.isNullable);
    }

    switch (normalizedDataType) {
        case 'tinyint':
            return wrapNullableRustType(isUnsigned ? 'u8' : 'i8', column.isNullable);
        case 'smallint':
            return wrapNullableRustType(isUnsigned ? 'u16' : 'i16', column.isNullable);
        case 'mediumint':
        case 'int':
            return wrapNullableRustType(isUnsigned ? 'u32' : 'i32', column.isNullable);
        case 'bigint':
            return wrapNullableRustType(isUnsigned ? 'u64' : 'i64', column.isNullable);
        case 'float':
            return wrapNullableRustType('f32', column.isNullable);
        case 'double':
            return wrapNullableRustType('f64', column.isNullable);
        case 'decimal':
            return wrapNullableRustType('rust_decimal::Decimal', column.isNullable);
        case 'date':
            return wrapNullableRustType('chrono::NaiveDate', column.isNullable);
        case 'datetime':
        case 'timestamp':
            return wrapNullableRustType('chrono::NaiveDateTime', column.isNullable);
        case 'time':
            return wrapNullableRustType('chrono::NaiveTime', column.isNullable);
        case 'mediumblob':
        case 'longblob':
        case 'binary':
            return wrapNullableRustType('Vec<u8>', column.isNullable);
        case 'char':
        case 'varchar':
        case 'text':
        case 'mediumtext':
        case 'longtext':
        case 'enum':
        default:
            return wrapNullableRustType('String', column.isNullable);
    }
}

async function buildMysqlSchemaManifest(options: GenerateRustTypesMysqlOptions): Promise<MysqlSchemaManifest> {
    const DB = DBMysql.getInstance(
        {
            host: options.host,
            user: options.user,
            password: options.password,
            db: options.db,
            connectionLimit: 1,
            logFolder: options.logFolder
        },
        'generateRustTypesMysql'
    );

    try {
        const tablesResult = await DB.doQuery({
            queryString: `
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = ?
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name
            `,
            parameters: [options.db]
        });

        const allTables = (tablesResult as ResultSetHeader & { table_name: string }[]).map((row) => row.table_name);

        const tableMap = new Map<string, string>();

        for (const tableName of allTables) {
            if (isShardedTable(tableName)) {
                const baseTableName = getBaseTableName(tableName);

                if (!tableMap.has(baseTableName)) {
                    tableMap.set(baseTableName, tableName);
                }
            } else {
                tableMap.set(tableName, tableName);
            }
        }

        const selectedTables = Array.from(tableMap.entries()).map(([baseTableName, sourceTableName]) => ({
            baseTableName,
            sourceTableName,
            isShardedFamily: baseTableName !== sourceTableName
        }));

        const placeholders = selectedTables.map(() => '?').join(', ');

        const columnsResult = await DB.doQuery({
            queryString: `
                SELECT
                    table_name,
                    column_name,
                    data_type,
                    column_type,
                    is_nullable,
                    column_default,
                    column_comment,
                    ordinal_position
                FROM information_schema.columns
                WHERE table_schema = ?
                  AND table_name IN (${placeholders})
                ORDER BY table_name, ordinal_position
            `,
            parameters: [options.db, ...selectedTables.map((table) => table.sourceTableName)]
        });

        const manifestTableMap = new Map<string, MysqlTableManifest>();

        for (const selectedTable of selectedTables) {
            manifestTableMap.set(selectedTable.sourceTableName, {
                baseTableName: selectedTable.baseTableName,
                sourceTableName: selectedTable.sourceTableName,
                isShardedFamily: selectedTable.isShardedFamily,
                columns: []
            });
        }

        for (const row of columnsResult as ResultSetHeader &
            {
                table_name: string;
                column_name: string;
                data_type: string;
                column_type: string;
                is_nullable: string;
                column_default: string | null;
                column_comment: string;
                ordinal_position: number;
            }[]) {
            const manifestTable = manifestTableMap.get(row.table_name);

            if (!manifestTable) {
                continue;
            }

            manifestTable.columns.push({
                columnName: row.column_name,
                dataType: row.data_type,
                columnType: row.column_type.replace(/(?:\\n|\r?\n)\s*/g, ''),
                isNullable: row.is_nullable === 'YES',
                columnDefault: row.column_default,
                columnComment: row.column_comment ?? '',
                ordinalPosition: row.ordinal_position
            });
        }

        return {
            generatedAt: new Date().toISOString(),
            databaseName: options.db,
            tables: Array.from(manifestTableMap.values()).sort((left, right) => left.baseTableName.localeCompare(right.baseTableName))
        };
    } finally {
        await DB.closeConnection();
    }
}

function emitRustSchemaSource(manifest: MysqlSchemaManifest, overrides: RustSchemaOverrides): string {
    let rustSource = `// Auto-generated Rust database schema for MariaDB
// Generated on: ${manifest.generatedAt}
//
// DO NOT EDIT THIS FILE DIRECTLY
// Regenerate via the project314 backend DB contract generator.

#[derive(Debug, Clone, Copy)]
pub struct ColumnMetadata {
    pub column_name: &'static str,
    pub rust_field_name: &'static str,
    pub sql_data_type: &'static str,
    pub sql_column_type: &'static str,
    pub is_nullable: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct TableMetadata {
    pub base_table_name: &'static str,
    pub source_table_name: &'static str,
    pub is_sharded_family: bool,
    pub columns: &'static [ColumnMetadata],
}

pub trait GeneratedTableRow {
    const BASE_TABLE_NAME: &'static str;
    const SOURCE_TABLE_NAME: &'static str;
    const ALL_COLUMNS_SQL: &'static str;
    const TABLE_METADATA: &'static TableMetadata;
}

`;

    for (const table of manifest.tables) {
        const structName = `${toPascalCase(table.baseTableName)}Row`;
        const metadataConstName = `${toUpperSnakeCase(table.baseTableName)}_METADATA`;
        const macroBaseName = toSafeRustIdentifier(table.baseTableName);
        const allColumnsSql = table.columns.map((column) => `\`${column.columnName}\``).join(', ');
        const selectColumnsSqlLiteral = table.columns.map((column) => `\`${column.columnName}\` AS \`${column.columnName}\``).join(', ');

        rustSource += `#[derive(Debug, Clone, sqlx::FromRow)]
#[allow(dead_code)]
pub struct ${structName} {
`;

        for (const column of table.columns) {
            const fieldName = toSafeRustIdentifier(column.columnName);
            const rustType = mapMysqlColumnToRustType(table, column, overrides);

            if (fieldName !== column.columnName) {
                rustSource += `    #[sqlx(rename = "${escapeRustStringLiteral(column.columnName)}")]\n`;
            }

            rustSource += `    pub ${fieldName}: ${rustType},\n`;
        }

        rustSource += `}

impl ${structName} {
    pub const BASE_TABLE_NAME: &'static str = "${escapeRustStringLiteral(table.baseTableName)}";
    pub const SOURCE_TABLE_NAME: &'static str = "${escapeRustStringLiteral(table.sourceTableName)}";
    pub const ALL_COLUMNS_SQL: &'static str = "${escapeRustStringLiteral(allColumnsSql)}";
}

impl GeneratedTableRow for ${structName} {
    const BASE_TABLE_NAME: &'static str = Self::BASE_TABLE_NAME;
    const SOURCE_TABLE_NAME: &'static str = Self::SOURCE_TABLE_NAME;
    const ALL_COLUMNS_SQL: &'static str = Self::ALL_COLUMNS_SQL;
    const TABLE_METADATA: &'static TableMetadata = &${metadataConstName};
}

#[macro_export]
macro_rules! ${macroBaseName}_all_columns_sql_literal {
    () => {
        "${escapeRustStringLiteral(allColumnsSql)}"
    };
}

#[macro_export]
macro_rules! ${macroBaseName}_select_columns_sql_literal {
    () => {
        "${escapeRustStringLiteral(selectColumnsSqlLiteral)}"
    };
}

pub const ${metadataConstName}: TableMetadata = TableMetadata {
    base_table_name: "${escapeRustStringLiteral(table.baseTableName)}",
    source_table_name: "${escapeRustStringLiteral(table.sourceTableName)}",
    is_sharded_family: ${table.isShardedFamily},
    columns: &[
`;

        for (const column of table.columns) {
            const fieldName = toSafeRustIdentifier(column.columnName);

            rustSource += `        ColumnMetadata {
            column_name: "${escapeRustStringLiteral(column.columnName)}",
            rust_field_name: "${escapeRustStringLiteral(fieldName)}",
            sql_data_type: "${escapeRustStringLiteral(column.dataType)}",
            sql_column_type: "${escapeRustStringLiteral(column.columnType)}",
            is_nullable: ${column.isNullable},
        },
`;
        }

        rustSource += `    ],
};

`;
    }

    return rustSource;
}

export const generateRustTypesMysql = async (options: GenerateRustTypesMysqlOptions): Promise<void> => {
    const manifest = await buildMysqlSchemaManifest(options);
    const overrides = readRustSchemaOverrides(options.schemaOverridesPath);
    const rustSource = emitRustSchemaSource(manifest, overrides);

    ensureDirectoryExists(options.outputPath);
    fs.writeFileSync(options.outputPath, rustSource);

    if (options.manifestOutputPath) {
        ensureDirectoryExists(options.manifestOutputPath);
        fs.writeFileSync(options.manifestOutputPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
};
