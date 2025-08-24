import type { PoolConnection } from 'mysql2/promise';
import type { PoolClient, QueryResult } from 'pg';

export type AnyPrimitive = string | number | boolean;
export type AnyPrimitiveNull = string | number | boolean | null;
export type AnyPrimitiveNullUndefined = string | number | boolean | null | undefined;

export type DbParameters = (AnyPrimitiveNullUndefined | AnyPrimitiveNullUndefined[] | AnyPrimitiveNullUndefined[][])[];
export type DbParametersWithDate = (Date | AnyPrimitiveNullUndefined | AnyPrimitiveNullUndefined[] | AnyPrimitiveNullUndefined[][])[];

export type WithoutNullableKeys<Type> = {
    [Key in keyof Type]-?: WithoutNullableKeys<NonNullable<Type[Key]>>;
};

/**
 * Utility type that normalizes null and undefined to be equivalent.
 * This allows passing undefined values where null is expected and vice versa.
 */
export type NullUndefinedEquivalent<T> = T extends null | undefined ? null | undefined : T;

/**
 * Utility type that converts undefined to null for database compatibility.
 * Databases typically use NULL rather than undefined.
 */
export type UndefinedToNull<T> = T extends undefined ? null : T extends null | undefined ? null : T;

/**
 * Simplified utility type for making null and undefined interchangeable in object properties.
 * This is useful for database operations where you want to accept either null or undefined
 * for nullable fields.
 */
export type NullableFlexible<T> = {
    [K in keyof T]: T[K] extends null | undefined ? T[K] | null | undefined : T[K];
};

/**
 * Helper type to normalize null and undefined in union types
 */
type NormalizeNullUndefined<T> = T extends null | undefined
    ? null | undefined
    : T extends infer U | null
      ? U | null | undefined
      : T extends infer U | undefined
        ? U | null | undefined
        : T;

export type Insertable<T> = {
    [K in keyof T]: NormalizeNullUndefined<T[K]>;
};

export type DbParametersRow = { [key: string]: AnyPrimitiveNullUndefined };

/**
 * Runtime utility function to normalize undefined values to null for database compatibility.
 * This function recursively converts all undefined values in an object to null.
 */
export function normalizeUndefinedToNull<T>(obj: T): UndefinedToNull<T> {
    if (obj === undefined) {
        return null as UndefinedToNull<T>;
    }

    if (obj === null || typeof obj !== 'object') {
        return obj as UndefinedToNull<T>;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) =>
            normalizeUndefinedToNull(item as string | number | boolean | Date | null | undefined)
        ) as UndefinedToNull<T>;
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        result[key] = normalizeUndefinedToNull(value);
    }

    return result as UndefinedToNull<T>;
}

/**
 * Interface for database configuration
 */
export interface DBConfig {
    user: string;
    host: string;
    password: string;
    db: string;
    charset?: string;
    connectionLimit?: number;
    logFolder: string;
    /** Maximum number of retry attempts for database operations. Defaults to 4 if not specified. */
    maxRetries?: number;
    /** Delay in milliseconds between retry attempts. Defaults to 10000 (10 seconds) if not specified. */
    retryDelayMs?: number;
    /** Request timeout in milliseconds for ClickHouse HTTP requests. Defaults to 400000 (400 seconds) if not specified. */
    requestTimeout?: number;
    /** Server-side max execution time in seconds for ClickHouse queries. Defaults to 360 (6 minutes) if not specified. */
    maxExecutionTime?: number;
    /** Send progress headers to keep connection alive for long queries (ClickHouse). Defaults to true. */
    sendProgressHeaders?: boolean;
    /** Interval in milliseconds for sending progress headers (ClickHouse). Defaults to 20000 (20 seconds). */
    progressHeaderInterval?: number;
}

// PostgreSQL client type
export type PgQueryResult = QueryResult;

// -----------------------------------------------------------------------------
// WHERE Condition Types
// -----------------------------------------------------------------------------

type ScalarWhereCondition<T> = {
    column: keyof T;
    operator?: Exclude<
        '=' | '>' | '>=' | '<' | '<=' | '!=' | '<>' | 'LIKE' | 'NOT LIKE' | 'IS' | 'IS NOT',
        'IN' | 'NOT IN' | 'BETWEEN' | 'NOT BETWEEN'
    >;
    value: T[keyof T];
};

type ArrayWhereCondition<T> = {
    column: keyof T;
    operator: 'IN' | 'NOT IN' | 'BETWEEN' | 'NOT BETWEEN';
    value: T[keyof T][];
};

type GroupedWhereCondition<T> = {
    group: WhereCondition<T>[];
    operator?: 'AND' | 'OR';
};

export type WhereCondition<T> = ScalarWhereCondition<T> | ArrayWhereCondition<T> | GroupedWhereCondition<T>;

// -----------------------------------------------------------------------------
// BaseSelectConfig
// -----------------------------------------------------------------------------

export type OrderBy<T> = { column: keyof T; direction?: 'ASC' | 'DESC' } | { column: keyof T; direction?: 'ASC' | 'DESC' }[];
export interface BaseSelectConfig<T extends object> {
    table: string;
    where?: WhereCondition<T>[] | WhereCondition<T>;
    whereOperator?: 'AND' | 'OR';
    orderBy?: OrderBy<T>;
    limit?: number | undefined;
    offset?: number;
    forUpdate?: boolean;
    verbose?: boolean;
    /**
     * When true (default), if no explicit columns are provided, defaults to '*'.
     * When false, no default '*' is used.
     */
    selectAllColumns?: boolean;
    // New groupBy property – accepts a single column or an array of columns
    groupBy?: keyof T | (keyof T)[];
}

// -----------------------------------------------------------------------------
// SelectConfig
// -----------------------------------------------------------------------------

/**
 * SelectConfig now supports:
 * - columns?: an optional array of plain column names (keys of T)
 * - distinct?: if true, will prepend DISTINCT to the plain columns (if provided)
 * - computedColumns?: an optional array describing computed/wrapped columns.
 *    For each wrapper you specify:
 *      - column: a key of T to wrap,
 *      - wrapper: one of 'DISTINCT' | 'SUM' | 'COUNT' | 'AVG' | 'MAX' | 'MIN'
 *      - alias?: the alias to use (if omitted, the original column name is used)
 *
 * Additionally, you can now pass a groupBy option to add a GROUP BY clause.
 */
export interface SelectConfig<T extends object, C extends (keyof T)[] | undefined = undefined> extends BaseSelectConfig<T> {
    columns?: C;
    distinct?: boolean;
    computedColumns?: { column: keyof T; wrapper: 'DISTINCT' | 'SUM' | 'COUNT' | 'AVG' | 'MAX' | 'MIN'; alias?: string }[];
    // New property: raw column expressions to append
    rawColumns?: string[];
}

export interface SelectConfigPg<T extends object = object, C extends (keyof T)[] | undefined = undefined> extends SelectConfig<T, C> {
    connection?: PoolClient;
}

export interface SelectConfigMysql<T extends object = object, C extends (keyof T)[] | undefined = undefined> extends SelectConfig<T, C> {
    connection?: PoolConnection;
}

/**
 * ClickHouse-specific wrapper functions
 */
export type ClickHouseWrapper = 'DISTINCT' | 'SUM' | 'COUNT' | 'AVG' | 'MAX' | 'MIN' | 'toInt32';

/**
 * SelectConfigClickhouse extends the base SelectConfig for ClickHouse-specific functionality
 */
export interface SelectConfigClickhouse<T extends object = object, C extends (keyof T)[] | undefined = undefined>
    extends Omit<SelectConfig<T, C>, 'computedColumns'> {
    computedColumns?: {
        column: keyof T;
        wrapper: ClickHouseWrapper;
        alias?: string;
    }[];
}

/**
 * Conditional return type: If C is undefined, return T[].
 * Otherwise, return Pick<T, C[number]>[].
 */
export type SelectReturn<T extends object, C extends (keyof T)[] | undefined> = C extends (keyof T)[] ? Pick<T, C[number]>[] : T[];
