/* eslint-disable sonarjs/no-nested-template-literals */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable max-len */
import type { QueryResult } from 'pg';
import fs from 'fs';
import { DBPostgres } from './postgres.js';

// Helper function to check if a column has a default value that should be omitted
function hasDefaultValueToOmit(columnDefault: string | null): boolean {
    // Don't omit if default is null or 0
    if (columnDefault === null) return false;
    if (columnDefault.startsWith('0.0')) return false;
    if (columnDefault === '0') return false;
    if (columnDefault === 'NULL') return false;
    if (columnDefault?.toLowerCase() === 'null') return false;

    // Otherwise, consider it a default value to omit
    return true;
}

// Interface for enum type information
interface EnumType {
    typeName: string;
    values: string[] | string;
}

export interface GenerateTypesPgOptions {
    host: string;
    user: string;
    password: string;
    db: string;
    logFolder: string;
    outputPath: string;
}

// Function to fetch all enum types and their values from PostgreSQL
async function fetchEnumTypes(DB: DBPostgres): Promise<Map<string, EnumType>> {
    console.log('Fetching enum types...');

    const enumTypesResult = (await DB.doQuery({
        queryString: `
            SELECT
                t.typname AS enum_name,
                array_agg(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
            FROM pg_type t
            JOIN pg_enum e ON t.oid = e.enumtypid
            JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = 'public'
            GROUP BY t.typname
        `
    })) as QueryResult<{ enum_name: string; enum_values: string[] | string }>;

    const enumTypesMap = new Map<string, EnumType>();

    if (enumTypesResult.rows.length > 0) {
        console.log(`Found ${enumTypesResult.rows.length} enum types`);

        for (const row of enumTypesResult.rows) {
            enumTypesMap.set(row.enum_name, {
                typeName: row.enum_name,
                values: row.enum_values
            });
        }
    } else {
        console.log('No enum types found in the database');
    }

    return enumTypesMap;
}

// Function to fetch table comment from PostgreSQL
async function fetchTableComment(DB: DBPostgres, tableName: string): Promise<string | null> {
    console.log(`Fetching comment for table: ${tableName}`);

    const tableCommentResult = (await DB.doQuery({
        queryString: `
            SELECT pg_description.description
            FROM pg_catalog.pg_class
            JOIN pg_catalog.pg_namespace ON pg_namespace.oid = pg_class.relnamespace
            LEFT JOIN pg_catalog.pg_description ON pg_description.objoid = pg_class.oid AND pg_description.objsubid = 0
            WHERE pg_class.relname = $1 AND pg_namespace.nspname = 'public'
        `,
        parameters: [tableName]
    })) as QueryResult<{ description: string }>;

    return tableCommentResult.rows[0]?.description || null;
}

// Function to fetch column comments from PostgreSQL
async function fetchColumnComments(DB: DBPostgres, tableName: string): Promise<Map<string, string | null>> {
    console.log(`Fetching comments for columns in table: ${tableName}`);

    const columnCommentsResult = (await DB.doQuery({
        queryString: `
            SELECT a.attname AS column_name, pg_description.description
            FROM pg_catalog.pg_class
            JOIN pg_catalog.pg_namespace ON pg_namespace.oid = pg_class.relnamespace
            JOIN pg_catalog.pg_attribute a ON pg_class.oid = a.attrelid
            LEFT JOIN pg_catalog.pg_description ON pg_description.objoid = pg_class.oid AND pg_description.objsubid = a.attnum
            WHERE pg_class.relname = $1 AND pg_namespace.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
        `,
        parameters: [tableName]
    })) as QueryResult<{ column_name: string; description: string }>;

    const columnCommentsMap = new Map<string, string | null>();

    for (const row of columnCommentsResult.rows) {
        columnCommentsMap.set(row.column_name, row.description);
    }

    return columnCommentsMap;
}

// eslint-disable-next-line complexity, max-statements
export const generateTypesPg = async (options: GenerateTypesPgOptions) => {
    const DB = DBPostgres.getInstance(
        {
            host: options.host,
            user: options.user,
            password: options.password,
            db: options.db,
            connectionLimit: 3,
            logFolder: options.logFolder
        },
        'generateTypesPg'
    );

    try {
        console.log('Fetching table information...');

        // Fetch all enum types and their values
        const enumTypesMap = await fetchEnumTypes(DB);

        // Get all tables in the public schema
        const tablesResult = (await DB.doQuery({
            queryString: `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `
        })) as QueryResult<{ table_name: string }>;

        const tables = tablesResult.rows.map((row) => row.table_name);

        if (tables.length === 0) {
            console.log('No tables found in the database.');
            await DB.closeConnection();
            return;
        }

        console.log(`Found ${tables.length} tables: ${tables.join(', ')}`);

        let typesFileContent = `/**
 * Auto-generated TypeScript interfaces for PostgreSQL database schema
 * Generated on: ${new Date().toISOString()}
 *
 * DO NOT EDIT THIS FILE DIRECTLY
 * Run the generate-db-types script to regenerate
 */
`;

        // Add date type definitions and utility types
        typesFileContent += `
/**
 * Utility type to make specific properties optional
 */
// helper to re-map an intersection back into a fresh object
type Simplify<T> = { [P in keyof T]: T[P] };

type WithOptional<T, K extends keyof T> =
  Simplify< Omit<T, K> & Partial<Pick<T, K>> >;
/**
 * Type for inserting records - makes fields with default values optional
 * Each table has a corresponding [TableName]Insert interface
 */
`;

        // Process each table
        for (const tableName of tables) {
            console.log(`Processing table: ${tableName}`);

            // Get column information for the table, including udt_name for enum types
            const columnsResult = (await DB.doQuery({
                queryString: `
                SELECT
                  column_name,
                  data_type,
                  udt_name,
                  is_nullable,
                  column_default,
                  character_maximum_length
                FROM information_schema.columns
                WHERE table_schema = 'public'
                AND table_name = $1
                ORDER BY ordinal_position;
              `,
                parameters: [tableName]
            })) as QueryResult<{
                column_name: string;
                data_type: string;
                udt_name: string;
                is_nullable: string;
                column_default: string;
                character_maximum_length: number | null;
            }>;

            const columns = columnsResult.rows;

            // Fetch table and column comments
            const tableComment = await fetchTableComment(DB, tableName);
            const columnComments = await fetchColumnComments(DB, tableName);

            // Generate TypeScript interface for the table
            const pascalCaseTableName = tableName
                .split('_')
                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                .join('');

            // Track columns with default values for the Insert interface
            const columnsWithDefaults: string[] = [];

            // Add table comment if it exists
            if (tableComment) {
                typesFileContent += `/**\n * ${tableComment}\n */\n`;
            }

            // Generate the main interface
            typesFileContent += `export interface ${pascalCaseTableName}Row {\n`;

            for (const column of columns) {
                const columnName = column.column_name;
                const isNullable = column.is_nullable === 'YES';
                const nullableSuffix = isNullable ? ' | null' : '';
                const hasDefaultToOmit = hasDefaultValueToOmit(column.column_default);

                // Common auto-generated columns
                const isAutoGenerated = columnName === 'id' || columnName === 'createdAt' || columnName === 'updatedAt' || hasDefaultToOmit;

                if (isAutoGenerated) {
                    columnsWithDefaults.push(columnName);
                }

                // Map PostgreSQL data types to TypeScript types
                let tsType: string;

                // Check if this column is an enum type
                if (column.data_type === 'USER-DEFINED' && enumTypesMap.has(column.udt_name)) {
                    // Get the enum values
                    const enumType = enumTypesMap.get(column.udt_name)!;

                    // Generate a union type of string literals for the enum values
                    // Parse the string format '{NEVER,DAILY,WEEKLY,INTERVAL}' into an array
                    const valuesArray: string[] =
                        typeof enumType.values === 'string' ? enumType.values.replace(/[{}]/g, '').split(',') : enumType.values;

                    tsType = valuesArray.map((value: string) => `'${value}'`).join(' | ');
                } else {
                    // Handle standard data types
                    switch (column.data_type.toLowerCase()) {
                        case 'integer':
                        case 'numeric':
                        case 'decimal':
                        case 'real':
                        case 'double precision':
                        case 'smallint':
                        case 'bigint':
                            tsType = 'number';
                            break;
                        case 'boolean':
                            tsType = 'boolean';
                            break;
                        case 'json':
                        case 'jsonb':
                            tsType = 'Record<string, any>';
                            break;
                        case 'timestamp with time zone':
                            tsType = 'Date';
                            break;
                        case 'timestamp without time zone':
                            tsType = 'string';
                            break;
                        case 'date':
                            tsType = 'string';
                            break;
                        case 'uuid':
                        case 'character varying':
                        case 'varchar':
                        case 'text':
                        case 'char':
                        case 'character':
                        default:
                            tsType = 'string';
                    }
                }

                // Add column comment if it exists
                const columnComment = columnComments.get(columnName);

                if (columnComment) {
                    typesFileContent += `  /** ${columnComment} */\n`;
                }

                typesFileContent += `  ${columnName}: ${tsType}${nullableSuffix};\n`;
            }

            typesFileContent += '}\n\n';

            // Generate the Insert interface (making columns with default values optional)
            if (columnsWithDefaults.length > 0) {
                typesFileContent += `/**
 * Insert interface for ${pascalCaseTableName} - makes columns with default values optional
 */
export type ${pascalCaseTableName}RowInsert = WithOptional<${pascalCaseTableName}Row, ${columnsWithDefaults.map((col) => `'${col}'`).join(' | ')}>\n\n`;
            }
        }

        // Write the generated types to file
        fs.writeFileSync(options.outputPath, typesFileContent);
        console.log(`TypeScript interfaces generated successfully at: ${options.outputPath}`);
    } catch (error) {
        console.error('Error generating TypeScript interfaces:', error);
    } finally {
        await DB.closeConnection();
    }
};
