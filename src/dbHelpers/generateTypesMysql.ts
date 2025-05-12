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

        let typesFileContent = `/* eslint-disable @typescript-eslint/naming-convention */
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

            // Generate the main interface
            if (interfaceName !== tableName) {
                // This is a sharded table
                typesFileContent += `/**
 * Interface for the sharded table ${interfaceName}
 * This represents all shards (${interfaceName}_N)
 */\n`;
            }

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

                // Map MySQL data types to TypeScript types
                let tsType: string;

                // Check if this is an enum type
                if (column.data_type.toLowerCase() === 'enum') {
                    // Extract enum values from column_type
                    const enumValues = extractEnumValues(column.column_type);

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
                    /^tinyint\(1\)( unsigned)?$/i.test(column.column_type) &&
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
