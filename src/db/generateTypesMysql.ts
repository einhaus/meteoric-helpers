/* eslint-disable max-depth */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable max-len */
import type { ResultSetHeader } from 'mysql2/promise';
import fs from 'fs';
import { DBMysql } from './mysql.js';

// Helper function to check if a column has a default value that should be omitted
function hasDefaultValueToOmit(columnDefault: string | null): boolean {
    // Don't omit if default is null or 0
    if (columnDefault === null) return false;
    if (columnDefault === '0') return false;
    if (columnDefault.startsWith('0.0')) return false;
    if (columnDefault === 'NULL') return false;
    if (columnDefault.toLowerCase() === 'null') return false;

    // Otherwise, consider it a default value to omit
    return true;
}

// Helper function to extract enum values from MySQL column_type
function extractEnumValues(columnType: string): string[] {
    // MySQL enum types are stored as enum('value1','value2',...)
    if (!columnType.startsWith('enum(') || !columnType.endsWith(')')) {
        return [];
    }

    // Extract the values between enum( and )
    const valuesString = columnType.substring(5, columnType.length - 1);

    // Split by comma, but handle escaped commas within quotes
    // This regex matches values inside single quotes, handling escaped quotes
    const matches = valuesString.match(/'([^'\\]*(\\.[^'\\]*)*)'/g) || [];

    // Remove the surrounding quotes and unescape any escaped characters
    return matches.map((match) => {
        // Remove surrounding quotes
        const withoutQuotes = match.substring(1, match.length - 1);
        // Unescape any escaped characters
        return withoutQuotes.replace(/\\(.)/g, '$1');
    });
}

export interface GenerateTypesMysqlOptions {
    host: string;
    user: string;
    password: string;
    db: string;
    logFolder: string;
    outputPath: string;
}

// Helper function to check if a table is sharded (ends with _number)
function isShardedTable(tableName: string): boolean {
    return /^.+_\d+$/.test(tableName);
}

// Helper function to get the base table name from a sharded table
function getBaseTableName(tableName: string): string {
    return tableName.replace(/_\d+$/, '');
}

// Interface for table metadata
interface TableMetadata {
    comment: string | null;
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
// eslint-disable-next-line max-statements, complexity
async function fetchAllTablesMetadata(DB: DBMysql, dbName: string, tables: string[]): Promise<Map<string, TableMetadata>> {
    console.log('Fetching metadata for all tables...');
    const tableMetadataMap = new Map<string, TableMetadata>();

    // Initialize metadata for all tables
    for (const tableName of tables) {
        tableMetadataMap.set(tableName, {
            comment: null,
            indexes: [],
            foreignKeys: []
        });
    }

    // 1. Fetch all table comments
    console.log('Fetching all table comments...');

    const tableCommentsResult = await DB.doQuery({
        queryString: `
            SELECT
                table_name,
                table_comment
            FROM information_schema.tables
            WHERE table_schema = ?
            AND table_type = 'BASE TABLE'
        `,
        parameters: [dbName]
    });

    if (tableCommentsResult && Array.isArray(tableCommentsResult) && tableCommentsResult.length > 0) {
        const commentRows = tableCommentsResult as ResultSetHeader &
            {
                table_name: string;
                table_comment: string;
            }[];

        for (const row of commentRows) {
            if (tableMetadataMap.has(row.table_name) && row.table_comment && row.table_comment.length > 0) {
                tableMetadataMap.get(row.table_name)!.comment = row.table_comment;
            }
        }
    }

    // 2. Fetch all indexes
    console.log('Fetching all indexes...');

    const indexesResult = await DB.doQuery({
        queryString: `
            SELECT
                table_name,
                index_name,
                column_name,
                non_unique
            FROM information_schema.statistics
            WHERE table_schema = ?
            ORDER BY table_name, index_name, seq_in_index
        `,
        parameters: [dbName]
    });

    // Create a temporary map to group index columns by table and index name
    const indexColumnsMap = new Map<
        string,
        Map<
            string,
            {
                columns: string[];
                is_unique: boolean;
            }
        >
    >();

    if (indexesResult && Array.isArray(indexesResult) && indexesResult.length > 0) {
        const indexRows = indexesResult as ResultSetHeader &
            {
                table_name: string;
                index_name: string;
                column_name: string;
                non_unique: number;
            }[];

        // Group columns by table and index name
        for (const row of indexRows) {
            if (!tableMetadataMap.has(row.table_name)) {
                continue; // Skip tables we're not processing
            }

            if (!indexColumnsMap.has(row.table_name)) {
                indexColumnsMap.set(row.table_name, new Map());
            }

            const tableIndexMap = indexColumnsMap.get(row.table_name)!;

            if (!tableIndexMap.has(row.index_name)) {
                tableIndexMap.set(row.index_name, {
                    columns: [],
                    is_unique: row.non_unique === 0
                });
            }

            tableIndexMap.get(row.index_name)!.columns.push(row.column_name);
        }
    }

    // 3. Fetch all foreign key constraints
    console.log('Fetching all foreign key constraints...');

    const fkConstraintsResult = await DB.doQuery({
        queryString: `
            SELECT
                tc.table_name,
                tc.constraint_name,
                kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
                AND tc.table_name = kcu.table_name
            WHERE tc.table_schema = ?
            AND tc.constraint_type = 'FOREIGN KEY'
        `,
        parameters: [dbName]
    });

    // Create a map of foreign key constraint names and their columns for each table
    const fkConstraintMap = new Map<string, Map<string, string[]>>();

    if (fkConstraintsResult && Array.isArray(fkConstraintsResult) && fkConstraintsResult.length > 0) {
        const fkRows = fkConstraintsResult as ResultSetHeader &
            {
                table_name: string;
                constraint_name: string;
                column_name: string;
            }[];

        for (const row of fkRows) {
            if (!tableMetadataMap.has(row.table_name)) {
                continue; // Skip tables we're not processing
            }

            if (!fkConstraintMap.has(row.table_name)) {
                fkConstraintMap.set(row.table_name, new Map());
            }

            const tableFkMap = fkConstraintMap.get(row.table_name)!;

            if (!tableFkMap.has(row.constraint_name)) {
                tableFkMap.set(row.constraint_name, []);
            }

            tableFkMap.get(row.constraint_name)!.push(row.column_name);
        }
    }

    // Now process the index data and mark foreign key indexes
    for (const [tableName, tableIndexMap] of indexColumnsMap.entries()) {
        const indexes = [];
        const tableFkMap = fkConstraintMap.get(tableName);

        for (const [indexName, indexData] of tableIndexMap.entries()) {
            // Check if this index is for a foreign key
            let isForeignKey = false;

            if (tableFkMap) {
                // Check if index name matches a foreign key constraint name
                if (tableFkMap.has(indexName)) {
                    isForeignKey = true;
                } else {
                    // Check if any column in this index is part of a foreign key
                    for (const fkColumns of tableFkMap.values()) {
                        for (const column of indexData.columns) {
                            if (fkColumns.includes(column)) {
                                isForeignKey = true;
                                break;
                            }
                        }

                        if (isForeignKey) break;
                    }
                }
            }

            indexes.push({
                index_name: indexName,
                column_names: indexData.columns,
                is_unique: indexData.is_unique,
                is_primary: indexName === 'PRIMARY',
                is_foreign_key: isForeignKey
            });
        }

        if (tableMetadataMap.has(tableName)) {
            tableMetadataMap.get(tableName)!.indexes = indexes;
        }
    }

    // 4. Fetch all foreign key details
    console.log('Fetching all foreign key details...');

    const foreignKeysResult = await DB.doQuery({
        queryString: `
            SELECT
                kcu.table_name,
                kcu.constraint_name,
                kcu.column_name,
                kcu.referenced_table_name,
                kcu.referenced_column_name,
                rc.update_rule,
                rc.delete_rule
            FROM information_schema.key_column_usage kcu
            JOIN information_schema.referential_constraints rc
                ON kcu.constraint_name = rc.constraint_name
                AND kcu.constraint_schema = rc.constraint_schema
            WHERE kcu.table_schema = ?
            AND kcu.referenced_table_name IS NOT NULL
            ORDER BY kcu.table_name, kcu.constraint_name, kcu.ordinal_position
        `,
        parameters: [dbName]
    });

    if (foreignKeysResult && Array.isArray(foreignKeysResult) && foreignKeysResult.length > 0) {
        const fkRows = foreignKeysResult as ResultSetHeader &
            {
                table_name: string;
                constraint_name: string;
                column_name: string;
                referenced_table_name: string;
                referenced_column_name: string;
                update_rule: string;
                delete_rule: string;
            }[];

        for (const row of fkRows) {
            if (!tableMetadataMap.has(row.table_name)) {
                continue; // Skip tables we're not processing
            }

            tableMetadataMap.get(row.table_name)!.foreignKeys.push({
                constraint_name: row.constraint_name,
                column_name: row.column_name,
                referenced_table: row.referenced_table_name,
                referenced_column: row.referenced_column_name,
                update_rule: row.update_rule,
                delete_rule: row.delete_rule
            });
        }
    }

    return tableMetadataMap;
}

// eslint-disable-next-line complexity, max-statements
export const generateTypesMysql = async (options: GenerateTypesMysqlOptions) => {
    const DB = DBMysql.getInstance(
        {
            host: options.host,
            user: options.user,
            password: options.password,
            db: options.db,
            connectionLimit: 1,
            logFolder: options.logFolder
        },
        'generateTypesMysql'
    );

    try {
        console.log('Fetching table information...');

        // Get all tables in the database
        const tablesResult = await DB.doQuery({
            queryString: `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ?
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `,
            parameters: [options.db]
        });

        if (!tablesResult) {
            console.log('No tables found or error occurred.');
            await DB.closeConnection();
            return;
        }

        // MySQL returns rows as an array
        const allTables = (tablesResult as ResultSetHeader & { table_name: string }[]).map((row) => row.table_name);

        if (allTables.length === 0) {
            console.log('No tables found in the database.');
            await DB.closeConnection();
            return;
        }

        console.log(`Found ${allTables.length} tables: ${allTables.join(', ')}`);

        // Create a map to organize tables
        // For non-sharded tables: key = table name, value = table name
        // For sharded tables: key = base table name, value = first shard name
        const tableMap = new Map<string, string>();

        // First, identify all tables and their base names
        for (const tableName of allTables) {
            if (isShardedTable(tableName)) {
                const baseTableName = getBaseTableName(tableName);

                // Only add the first shard we encounter for each base name
                if (!tableMap.has(baseTableName)) {
                    tableMap.set(baseTableName, tableName);
                    console.log(`Using ${tableName} as representative for sharded table group ${baseTableName}`);
                }
            } else {
                // For non-sharded tables, just map to themselves
                tableMap.set(tableName, tableName);
            }
        }

        // Now we have a map where each key is a unique table name (base name for sharded tables)
        // and each value is the actual table name to use for schema extraction
        console.log(`Consolidated ${allTables.length} tables into ${tableMap.size} unique table definitions`);

        // Convert the map to an array of [interfaceName, tableName] pairs for processing
        const tablesToProcess: [string, string][] = Array.from(tableMap.entries());

        // Fetch all metadata for all tables at once
        const tableMetadataMap = await fetchAllTablesMetadata(DB, options.db, Array.from(tableMap.values()));

        let typesFileContent = `/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Auto-generated TypeScript interfaces for MySQL database schema
 * Generated on: ${new Date().toISOString()}
 *
 * DO NOT EDIT THIS FILE DIRECTLY
 * Run the generate-db-types script to regenerate
 */
`;

        // Add date type definitions
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
        for (const [interfaceName, tableName] of tablesToProcess) {
            console.log(`Processing table: ${tableName} (interface: ${interfaceName})`);

            // For sharded tables, interfaceName is the base name
            // For regular tables, interfaceName equals tableName

            // Get table metadata from our pre-fetched map
            const tableMetadata = tableMetadataMap.get(tableName);
            const tableComment = tableMetadata?.comment || null;

            // Get column information for the table, including column_type for enums and column comments
            const columnsResult = await DB.doQuery({
                queryString: `
                SELECT
                  column_name,
                  data_type,
                  column_type,
                  is_nullable,
                  column_default,
                  character_maximum_length,
                  column_comment
                FROM information_schema.columns
                WHERE table_schema = ?
                AND table_name = ?
                ORDER BY ordinal_position;
              `,
                parameters: [options.db, tableName]
            });

            if (!columnsResult) {
                console.log(`Error fetching columns for table: ${tableName}`);
                continue;
            }

            const columns = columnsResult as ResultSetHeader &
                {
                    column_name: string;
                    data_type: string;
                    column_type: string;
                    is_nullable: string;
                    column_default: string;
                    character_maximum_length: number | null;
                    column_comment: string;
                }[];

            // Generate TypeScript interface for the table
            const pascalCaseTableName = interfaceName
                .split('_')
                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                .join('');

            // Track columns with default values for the Insert interface
            const columnsWithDefaults: string[] = [];

            // Always add a comment with the table name
            if (tableComment) {
                // If there's a table comment, include both the table name and the comment
                typesFileContent += `/**\n * Table: \`${tableName}\`\n * ${tableComment}\n */\n`;
            } else if (interfaceName !== tableName) {
                // This is a sharded table
                typesFileContent += `/**\n * Table: \`${interfaceName}\`\n * Interface for the sharded table ${interfaceName}\n * This represents all shards (${interfaceName}_N)\n */\n`;
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

                // Normalize column_type to handle MySQL line wrapping in long enum definitions.
                // MySQL's information_schema can return column_type with literal '\n' escape sequences
                // (backslash + letter n) and/or actual newlines when the value exceeds display width.
                // Example: 'qqqBarS\n  tate' instead of 'qqqBarState'
                const columnType = column.column_type.replace(/(?:\\n|\r?\n)\s*/g, '');

                // Common auto-generated columns
                const isAutoGenerated = columnName === 'id' || columnName === 'createdAt' || columnName === 'updatedAt' || hasDefaultToOmit;

                if (isAutoGenerated) {
                    columnsWithDefaults.push(columnName);
                }

                // Add column type as a comment
                const nullableText = isNullable ? 'NULL' : 'NOT NULL';
                const columnTypeComment = `${columnType} ${nullableText}`;
                typesFileContent += `  /** ${columnTypeComment}`;

                // Add column comment if it exists and isn't just a "boolean" marker for tinyint
                if (
                    column.column_comment &&
                    !(
                        column.column_comment.toLowerCase() === 'boolean' &&
                        column.data_type.toLowerCase() === 'tinyint' &&
                        /^tinyint\(1\)( unsigned)?$/i.test(columnType)
                    )
                ) {
                    typesFileContent += `\n   * ${column.column_comment}`;
                }

                typesFileContent += ` */\n`;

                // Map MySQL data types to TypeScript types
                let tsType: string;

                // Check if this is an enum type
                if (column.data_type.toLowerCase() === 'enum') {
                    // Extract enum values from column_type
                    const enumValues = extractEnumValues(columnType);

                    if (enumValues.length > 0) {
                        // Generate a union type of string literals for the enum values
                        tsType = enumValues.map((value) => `'${value}'`).join(' | ');
                    } else {
                        // Fallback to string if we couldn't extract enum values
                        tsType = 'string';
                    }
                }
                // Special case for TINYINT(1) with a comment of "boolean"
                // Only treat tinyint(1) as 0 | 1 if it has a comment equal to "boolean"
                else if (
                    column.data_type.toLowerCase() === 'tinyint' &&
                    /^tinyint\(1\)( unsigned)?$/i.test(columnType) &&
                    column.column_comment.toLowerCase() === 'boolean'
                ) {
                    tsType = '0 | 1';
                } else {
                    // Handle standard data types
                    switch (column.data_type.toLowerCase()) {
                        case 'int':
                        case 'tinyint': // Other tinyint variants (not tinyint(1))
                        case 'smallint':
                        case 'mediumint':
                        case 'bigint':
                        case 'float':
                        case 'double':
                            tsType = 'number';
                            break;
                        case 'decimal':
                            tsType = 'string';
                            break;
                        case 'boolean':
                        case 'bit':
                            tsType = 'boolean';
                            break;
                        case 'json':
                            tsType = 'Record<string, any>';
                            break;
                        case 'timestamp':
                        case 'datetime':
                            tsType = 'string';
                            break;
                        case 'date':
                            tsType = 'string';
                            break;
                        case 'time':
                            tsType = 'number';
                            break;
                        case 'char':
                        case 'varchar':
                        case 'text':
                        case 'tinytext':
                        case 'mediumtext':
                        case 'longtext':
                        default:
                            tsType = 'string';
                    }
                }

                // Check if column name starts with a number or contains special characters
                const needsQuotes = /^[0-9]/.test(columnName) || /[^a-zA-Z0-9_]/.test(columnName);
                const formattedColumnName = needsQuotes ? `'${columnName}'` : columnName;
                typesFileContent += `  ${formattedColumnName}: ${tsType}${nullableSuffix};\n`;
            }

            typesFileContent += '}\n\n';

            // Get indexes and foreign keys from our pre-fetched metadata
            const indexes = tableMetadata?.indexes || [];
            const foreignKeys = tableMetadata?.foreignKeys || [];

            // Add indexes and foreign keys as comments below the interface
            if (indexes.length > 0 || foreignKeys.length > 0) {
                typesFileContent += `/**\n * Database metadata for ${pascalCaseTableName}Row:\n`;

                // Add indexes (excluding foreign key indexes which will be shown in the Foreign Keys section)
                const regularIndexes = indexes.filter((index: { is_foreign_key: boolean }) => !index.is_foreign_key);

                if (regularIndexes.length > 0) {
                    typesFileContent += ` *\n * Indexes:\n`;

                    for (const index of regularIndexes) {
                        let indexType = 'INDEX';

                        if (index.is_primary) {
                            indexType = 'PRIMARY KEY';
                        } else if (index.is_unique) {
                            indexType = 'UNIQUE INDEX';
                        }

                        // Format column names
                        const columnList = index.column_names.map((col: string) => `\`${col}\``).join(', ');
                        typesFileContent += ` * - ${indexType} \`${index.index_name}\` (${columnList})\n`;
                    }
                }

                // Add foreign keys
                if (foreignKeys.length > 0) {
                    typesFileContent += ` *\n * Foreign Keys:\n`;

                    // Group foreign keys by constraint name
                    const fkMap = new Map<
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

                    for (const fk of foreignKeys) {
                        if (!fkMap.has(fk.constraint_name)) {
                            fkMap.set(fk.constraint_name, {
                                constraint_name: fk.constraint_name,
                                columns: [],
                                referenced_table: fk.referenced_table,
                                referenced_columns: [],
                                update_rule: fk.update_rule,
                                delete_rule: fk.delete_rule
                            });
                        }

                        const constraint = fkMap.get(fk.constraint_name)!;
                        constraint.columns.push(fk.column_name);
                        constraint.referenced_columns.push(fk.referenced_column);
                    }

                    // Output each foreign key constraint
                    for (const [constraintName, fk] of fkMap.entries()) {
                        // Format column lists
                        const sourceColumns = fk.columns.map((col: string) => `\`${col}\``).join(', ');
                        const targetColumns = fk.referenced_columns.map((col: string) => `\`${col}\``).join(', ');

                        // Build the constraint description
                        typesFileContent += ` * - CONSTRAINT \`${constraintName}\` FOREIGN KEY (${sourceColumns}) `;
                        typesFileContent += `REFERENCES \`${fk.referenced_table}\` (${targetColumns}) `;
                        typesFileContent += `ON UPDATE ${fk.update_rule} ON DELETE ${fk.delete_rule}\n`;
                    }
                }

                typesFileContent += ` */\n\n`;
            }

            // Generate the Insert interface (making columns with default values optional)
            if (columnsWithDefaults.length > 0) {
                let insertComment = `/**\n * Insert interface for ${pascalCaseTableName} - makes columns with default values optional\n`;

                if (interfaceName !== tableName) {
                    insertComment += ` * This represents all shards of ${interfaceName}\n`;
                }

                insertComment += ` */\n`;

                // Format column names with quotes for the WithOptional type
                // Always use quotes in the type to be safe
                const formattedColumns = columnsWithDefaults.map((col) => `'${col}'`);

                // Use the WithOptional utility type to make default columns optional
                typesFileContent += `${insertComment}export type ${pascalCaseTableName}RowInsert = WithOptional<${pascalCaseTableName}Row, ${formattedColumns.join(' | ')}>\n\n`;
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
