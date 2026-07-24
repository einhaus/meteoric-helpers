/**
 * Tolerant parsing for JSON database columns.
 *
 * Depending on the driver and server, a JSON column may arrive as a raw JSON string
 * (mysql2 with `jsonStrings: true`, Bun.sql on MariaDB) or already decoded into
 * objects/arrays (mysql2 >= 3.23.0 default on MariaDB, Bun.sql on MySQL). These helpers
 * accept both shapes so row-mapping code never depends on driver behavior.
 *
 * Note: a JSON column whose value is a bare JSON string (e.g. '"hello"') is inherently
 * ambiguous under tolerant parsing — these helpers are intended for array/object-shaped
 * JSON columns, which is the overwhelmingly common case.
 */

/** A JSON column value as returned by a database driver: raw JSON string or already decoded. */
export type JsonColumnValue<T> = T | string | null;

/**
 * Parse a JSON column value that may be a raw JSON string or already decoded by the driver.
 * Returns null for null/undefined/empty values. Throws with `context` in the message when
 * the value is a string that is not valid JSON, so errors identify the offending column/row.
 * @param value Column value from a database row
 * @param context Identifies the column/row for error messages, e.g. `provider 123 regions`
 */
export const parseJsonColumn = <T>(value: JsonColumnValue<T> | undefined, context: string): T | null => {
    if (value === null || value === undefined || value === '') return null;

    if (typeof value !== 'string') return value;

    try {
        return JSON.parse(value) as T | null;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`${context} contains invalid JSON: ${reason}`, { cause: error });
    }
};

/**
 * Parse a JSON column expected to hold an array of strings.
 * Accepts raw JSON strings and driver-decoded arrays; validates the shape either way.
 */
export const parseJsonStringArrayColumn = (value: JsonColumnValue<string[]> | undefined, context: string): string[] | null => {
    const parsed = parseJsonColumn<string[]>(value, context);
    if (parsed === null) return null;

    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
        throw new Error(`${context} must be a JSON array of strings.`);
    }

    return parsed;
};

/**
 * Parse a JSON column expected to hold an array of numbers.
 * Accepts raw JSON strings and driver-decoded arrays; validates the shape either way.
 */
export const parseJsonNumberArrayColumn = (value: JsonColumnValue<number[]> | undefined, context: string): number[] | null => {
    const parsed = parseJsonColumn<number[]>(value, context);
    if (parsed === null) return null;

    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'number')) {
        throw new Error(`${context} must be a JSON array of numbers.`);
    }

    return parsed;
};

/**
 * Parse a JSON column expected to hold a plain object (not an array).
 * Accepts raw JSON strings and driver-decoded objects; validates the shape either way.
 */
export const parseJsonObjectColumn = <T extends Record<string, unknown>>(
    value: JsonColumnValue<T> | undefined,
    context: string
): T | null => {
    const parsed = parseJsonColumn<T>(value, context);
    if (parsed === null) return null;

    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${context} must be a JSON object.`);
    }

    return parsed;
};
