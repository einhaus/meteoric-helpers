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
    /**
     * Optional import path used to emit Bun DB schema helpers alongside the existing row/insert types.
     * Example: '@einhaus/meteoric-helpers'
     */
    bunTypesImportPath?: string;
    /**
     * Optional name for the generated Bun schema interface.
     * Defaults to 'DatabaseBunSchema'.
     */
    bunSchemaName?: string;
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

// Interface for table metadata
interface TableMetadata {
    comment: string | null;
    columnComments: Map<string, string | null>;
    indexes: {
        index_name: string;
        column_names: string[];
        is_unique: boolean;
        is_primary: boolean;
        is_foreign_key: boolean;
    }[];
    foreignKeys: {
        constraint_name: string;
        column_name: string;
        referenced_table: string;
        referenced_column: string;
        update_rule: string;
        delete_rule: string;
    }[];
}

// Function to fetch all metadata for all tables at once
// eslint-disable-next-line max-statements
async function fetchAllTablesMetadata(DB: DBPostgres, tables: string[]): Promise<Map<string, TableMetadata>> {
    console.log('Fetching metadata for all tables...');
    const tableMetadataMap = new Map<string, TableMetadata>();

    // Initialize metadata for all tables
    for (const tableName of tables) {
        tableMetadataMap.set(tableName, {
            comment: null,
            columnComments: new Map<string, string | null>(),
            indexes: [],
            foreignKeys: []
        });
    }

    // 1. Fetch all table comments
    console.log('Fetching all table comments...');

    const tableCommentsResult = (await DB.doQuery({
        queryString: `
            SELECT c.relname AS table_name, pg_description.description
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_catalog.pg_description ON pg_description.objoid = c.oid AND pg_description.objsubid = 0
            WHERE n.nspname = 'public' AND c.relkind = 'r'
        `
    })) as QueryResult<{ table_name: string; description: string }>;

    for (const row of tableCommentsResult.rows) {
        if (tableMetadataMap.has(row.table_name) && row.description) {
            tableMetadataMap.get(row.table_name)!.comment = row.description;
        }
    }

    // 2. Fetch all column comments
    console.log('Fetching all column comments...');

    const columnCommentsResult = (await DB.doQuery({
        queryString: `
            SELECT c.relname AS table_name, a.attname AS column_name, pg_description.description
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_catalog.pg_attribute a ON c.oid = a.attrelid
            LEFT JOIN pg_catalog.pg_description ON pg_description.objoid = c.oid AND pg_description.objsubid = a.attnum
            WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
        `
    })) as QueryResult<{ table_name: string; column_name: string; description: string }>;

    for (const row of columnCommentsResult.rows) {
        if (tableMetadataMap.has(row.table_name)) {
            tableMetadataMap.get(row.table_name)!.columnComments.set(row.column_name, row.description);
        }
    }

    // 3. Fetch all indexes
    console.log('Fetching all indexes...');

    const indexesResult = (await DB.doQuery({
        queryString: `
            SELECT
                t.relname AS table_name,
                i.relname AS index_name,
                a.attname AS column_name,
                ix.indisunique AS is_unique,
                ix.indisprimary AS is_primary
            FROM pg_class t
            JOIN pg_index ix ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'public' AND t.relkind = 'r'
            ORDER BY t.relname, i.relname, a.attnum
        `
    })) as QueryResult<{
        table_name: string;
        index_name: string;
        column_name: string;
        is_unique: boolean;
        is_primary: boolean;
    }>;

    // Group indexes by table and index name
    const indexMap = new Map<
        string,
        Map<
            string,
            {
                columns: string[];
                is_unique: boolean;
                is_primary: boolean;
            }
        >
    >();

    for (const row of indexesResult.rows) {
        if (!tableMetadataMap.has(row.table_name)) {
            continue;
        }

        if (!indexMap.has(row.table_name)) {
            indexMap.set(row.table_name, new Map());
        }

        const tableIndexMap = indexMap.get(row.table_name)!;

        if (!tableIndexMap.has(row.index_name)) {
            tableIndexMap.set(row.index_name, {
                columns: [],
                is_unique: row.is_unique,
                is_primary: row.is_primary
            });
        }

        tableIndexMap.get(row.index_name)!.columns.push(row.column_name);
    }

    // 4. Fetch all foreign keys
    console.log('Fetching all foreign key constraints...');

    const foreignKeysResult = (await DB.doQuery({
        queryString: `
            SELECT
                tc.table_name,
                tc.constraint_name,
                kcu.column_name,
                ccu.table_name AS referenced_table,
                ccu.column_name AS referenced_column,
                rc.update_rule,
                rc.delete_rule
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            JOIN information_schema.referential_constraints rc
                ON rc.constraint_name = tc.constraint_name
                AND rc.constraint_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = 'public'
            ORDER BY tc.table_name, tc.constraint_name
        `
    })) as QueryResult<{
        table_name: string;
        constraint_name: string;
        column_name: string;
        referenced_table: string;
        referenced_column: string;
        update_rule: string;
        delete_rule: string;
    }>;

    // Create a map of foreign key constraint names for each table
    const fkConstraintMap = new Map<string, Set<string>>();

    for (const row of foreignKeysResult.rows) {
        if (!tableMetadataMap.has(row.table_name)) {
            continue;
        }

        // Add foreign key to the table's metadata
        tableMetadataMap.get(row.table_name)!.foreignKeys.push({
            constraint_name: row.constraint_name,
            column_name: row.column_name,
            referenced_table: row.referenced_table,
            referenced_column: row.referenced_column,
            update_rule: row.update_rule,
            delete_rule: row.delete_rule
        });

        // Track the constraint name for marking indexes as foreign keys
        if (!fkConstraintMap.has(row.table_name)) {
            fkConstraintMap.set(row.table_name, new Set());
        }

        fkConstraintMap.get(row.table_name)!.add(row.constraint_name);
    }

    // Now process the index data and mark foreign key indexes
    for (const [tableName, tableIndexMap] of indexMap.entries()) {
        const indexes = [];
        const fkConstraints = fkConstraintMap.get(tableName);

        for (const [indexName, indexData] of tableIndexMap.entries()) {
            // Check if this index is for a foreign key
            // In PostgreSQL, foreign key indexes often have the same name as the constraint
            const isForeignKey = fkConstraints?.has(indexName) || false;

            indexes.push({
                index_name: indexName,
                column_names: indexData.columns,
                is_unique: indexData.is_unique,
                is_primary: indexData.is_primary,
                is_foreign_key: isForeignKey
            });
        }

        if (tableMetadataMap.has(tableName)) {
            tableMetadataMap.get(tableName)!.indexes = indexes;
        }
    }

    return tableMetadataMap;
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

        const shouldEmitBunSchema = typeof options.bunTypesImportPath === 'string' && options.bunTypesImportPath.length > 0;
        const bunSchemaName = options.bunSchemaName || 'DatabaseBunSchema';
        const bunSchemaMetadataName = `${bunSchemaName}Metadata`;
        const bunSchemaEntries: string[] = [];
        const bunSchemaMetadataEntries: string[] = [];

        if (shouldEmitBunSchema) {
            typesFileContent += `import type { BunDbRuntimeSchemaMetadata, BunDbSchemaTable, BunDbUpdateShape } from '${options.bunTypesImportPath}';\n\n`;
        }

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

        // Fetch all metadata for all tables at once
        const tableMetadataMap = await fetchAllTablesMetadata(DB, tables);

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

            // Get table metadata from our pre-fetched map
            const tableMetadata = tableMetadataMap.get(tableName);
            const tableComment = tableMetadata?.comment || null;
            const columnComments = tableMetadata?.columnComments || new Map<string, string | null>();

            // Generate TypeScript interface for the table
            const pascalCaseTableName = tableName
                .split('_')
                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                .join('');

            // Track columns with default values for the Insert interface
            const columnsWithDefaults: string[] = [];

            // Always add a comment with the table name
            if (tableComment) {
                // If there's a table comment, include both the table name and the comment
                typesFileContent += `/**\n * Table: \`${tableName}\`\n * ${tableComment}\n */\n`;
            } else {
                // Just add the table name
                typesFileContent += `/**\n * Table: \`${tableName}\`\n */\n`;
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

                // Format the column comment to include the user comment, database type, and default value
                const columnComment = columnComments.get(columnName);

                // Get database type information
                const dbType = column.data_type === 'USER-DEFINED' ? column.udt_name : column.data_type;
                const maxLength = column.character_maximum_length ? `(${column.character_maximum_length})` : '';

                // Build type and constraint information
                let dbTypeInfo = `DB Type: ${dbType}${maxLength}`;

                // Add default value information if it exists
                if (column.column_default) {
                    // Clean up the default value for display
                    let defaultValue = column.column_default;

                    // Remove nextval sequence calls for readability
                    if (defaultValue.includes('nextval(')) {
                        defaultValue = 'auto-increment';
                    }

                    dbTypeInfo += ` | Default: ${defaultValue}`;
                }

                // Add nullable information
                if (column.is_nullable === 'YES') {
                    dbTypeInfo += ' | Nullable';
                } else {
                    dbTypeInfo += ' | NOT NULL';
                }

                // Build the comment with both user comment and type information
                let commentText = dbTypeInfo;

                if (columnComment) {
                    commentText = `${columnComment} | ${dbTypeInfo}`;
                }

                // Add the comment and property
                typesFileContent += `  /** ${commentText} */\n`;
                typesFileContent += `  ${columnName}: ${tsType}${nullableSuffix};\n`;
            }

            typesFileContent += '}\n\n';

            // Add indexes and foreign keys as comments below the interface
            const indexes = tableMetadata?.indexes || [];
            const foreignKeys = tableMetadata?.foreignKeys || [];
            const primaryKeyColumns = indexes.find((index) => index.is_primary)?.column_names ?? [];

            if (indexes.length > 0 || foreignKeys.length > 0) {
                typesFileContent += `/**\n * Database metadata for ${pascalCaseTableName}Row:\n`;

                // Add indexes (excluding foreign key indexes which will be shown in the Foreign Keys section)
                const regularIndexes = indexes.filter((index) => !index.is_foreign_key);

                if (regularIndexes.length > 0) {
                    typesFileContent += ` *\n * Indexes:\n`;

                    // Process each index and build the output
                    const indexesOutput = regularIndexes
                        .map((index) => {
                            // Determine index type based on properties
                            const getIndexType = (idx: typeof index) => {
                                if (idx.is_primary) return 'PRIMARY KEY';
                                if (idx.is_unique) return 'UNIQUE INDEX';
                                return 'INDEX';
                            };

                            const indexType = getIndexType(index);

                            // Format column names
                            const columnList = index.column_names.map((col) => `\`${col}\``).join(', ');
                            return ` * - ${indexType} \`${index.index_name}\` (${columnList})`;
                        })
                        .join('\n');

                    typesFileContent += `${indexesOutput}\n`;
                }

                // Add foreign keys
                if (foreignKeys.length > 0) {
                    typesFileContent += ` *\n * Foreign Keys:\n`;

                    // Group foreign keys by constraint name
                    const groupForeignKeysByConstraint = (fks: typeof foreignKeys) => {
                        const result = new Map<
                            string,
                            {
                                constraint_name: string;
                                columns: string[];
                                referenced_table: string;
                                referenced_columns: string[];
                                update_rule: string;
                                delete_rule: string;
                            }
                        >();

                        // Process each foreign key
                        fks.forEach((fk) => {
                            // Create new constraint entry if it doesn't exist
                            if (!result.has(fk.constraint_name)) {
                                result.set(fk.constraint_name, {
                                    constraint_name: fk.constraint_name,
                                    columns: [],
                                    referenced_table: fk.referenced_table,
                                    referenced_columns: [],
                                    update_rule: fk.update_rule,
                                    delete_rule: fk.delete_rule
                                });
                            }

                            // Add column information to the constraint
                            const constraint = result.get(fk.constraint_name)!;
                            constraint.columns.push(fk.column_name);
                            constraint.referenced_columns.push(fk.referenced_column);
                        });

                        return result;
                    };

                    // Group the foreign keys
                    const fkMap = groupForeignKeysByConstraint(foreignKeys);

                    // Format foreign key constraints as output
                    const formatForeignKeyConstraint = (
                        constraintName: string,
                        fk: {
                            columns: string[];
                            referenced_table: string;
                            referenced_columns: string[];
                            update_rule: string;
                            delete_rule: string;
                        }
                    ) => {
                        // Format column lists
                        const sourceColumns = fk.columns.map((col) => `\`${col}\``).join(', ');
                        const targetColumns = fk.referenced_columns.map((col) => `\`${col}\``).join(', ');

                        // Build the constraint description
                        return [
                            ` * - CONSTRAINT \`${constraintName}\` FOREIGN KEY (${sourceColumns})`,
                            `REFERENCES \`${fk.referenced_table}\` (${targetColumns})`,
                            `ON UPDATE ${fk.update_rule} ON DELETE ${fk.delete_rule}`
                        ].join(' ');
                    };

                    // Generate the foreign key output
                    const fkOutput = Array.from(fkMap.entries())
                        .map(([constraintName, fk]) => formatForeignKeyConstraint(constraintName, fk))
                        .join('\n');

                    typesFileContent += `${fkOutput}\n`;
                }

                typesFileContent += ` */\n\n`;
            }

            typesFileContent += `/**
 * Insert interface for ${pascalCaseTableName} - makes columns with default values optional
 */
export type ${pascalCaseTableName}RowInsert = ${
                columnsWithDefaults.length > 0
                    ? `WithOptional<${pascalCaseTableName}Row, ${columnsWithDefaults.map((col) => `'${col}'`).join(' | ')}>`
                    : `${pascalCaseTableName}Row`
            }\n\n`;

            if (shouldEmitBunSchema) {
                typesFileContent += `export type ${pascalCaseTableName}RowUpdate = BunDbUpdateShape<${pascalCaseTableName}RowInsert>\n\n`;

                const primaryKeyTypeArgument =
                    primaryKeyColumns.length > 0 ? `, ${primaryKeyColumns.map((column) => `'${column}'`).join(' | ')}` : '';

                bunSchemaEntries.push(
                    `    ${tableName}: BunDbSchemaTable<${pascalCaseTableName}Row, ${pascalCaseTableName}RowInsert, ${pascalCaseTableName}RowUpdate${primaryKeyTypeArgument}>;`
                );

                if (primaryKeyColumns.length === 1) {
                    bunSchemaMetadataEntries.push(`    ${tableName}: { primaryKey: '${primaryKeyColumns[0]}' },`);
                } else if (primaryKeyColumns.length > 1) {
                    bunSchemaMetadataEntries.push(
                        `    ${tableName}: { primaryKey: [${primaryKeyColumns.map((column) => `'${column}'`).join(', ')}] },`
                    );
                } else {
                    bunSchemaMetadataEntries.push(`    ${tableName}: {},`);
                }
            }
        }

        if (shouldEmitBunSchema) {
            typesFileContent += `export interface ${bunSchemaName} {\n${bunSchemaEntries.join('\n')}\n}\n\n`;
            typesFileContent += `export const ${bunSchemaMetadataName} = {\n${bunSchemaMetadataEntries.join('\n')}\n} as const satisfies BunDbRuntimeSchemaMetadata<${bunSchemaName}>;\n\n`;
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
