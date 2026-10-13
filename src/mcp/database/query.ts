import sqlParser from 'node-sql-parser';
import { createHash } from 'node:crypto';
import { DatabaseMcpError, type DatabaseMcpLimits, type DatabaseMcpProfile } from './config.js';

const parser = new sqlParser.Parser();
type Node = Record<string, unknown>;
function fail(): never {
    throw new DatabaseMcpError(
        'denied',
        'Query is outside the supported read-only SQL policy. Use explicit approved columns and a single SELECT.'
    );
}
const node = (value: unknown): Node => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Node) : fail());
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : fail());
const identifier = (value: unknown): string => (typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value) ? value : fail());
const quote = (value: unknown): string => `\`${identifier(value)}\``;
function onlyKeys(value: Node, allowed: string[]): void {
    if (Object.keys(value).some((key) => !allowed.includes(key) && value[key] != null)) fail();
}

function hasComments(sql: string): boolean {
    let quote: string | undefined;
    for (let index = 0; index < sql.length; index++) {
        const char = sql[index];
        if (quote) {
            if (char === '\\') index++;
            else if (char === quote) {
                if (sql[index + 1] === quote) index++;
                else quote = undefined;
            }
        } else if (char === "'" || char === '"' || char === '`') quote = char;
        else if (char === '#' || sql.slice(index, index + 2) === '--' || sql.slice(index, index + 2) === '/*') return true;
    }
    return false;
}

// node-sql-parser preserves literal escape syntax; prepared parameters need the decoded value.
function decodeString(value: string, quote: string): string {
    const escapes: Record<string, string> = { '0': '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a', '%': '\\%', _: '\\_' };
    let decoded = '';
    for (let index = 0; index < value.length; index++) {
        const char = value[index] ?? '';
        if (char === '\\') {
            const next = value[++index] ?? fail();
            decoded += Object.hasOwn(escapes, next) ? escapes[next] : next;
        } else if (char === quote && value[index + 1] === quote) {
            decoded += quote;
            index++;
        } else decoded += char;
    }
    return decoded;
}
const operators = new Set([
    '=',
    '!=',
    '<>',
    '<',
    '<=',
    '>',
    '>=',
    '<=>',
    'AND',
    'OR',
    '+',
    '-',
    '*',
    '/',
    '%',
    'LIKE',
    'NOT LIKE',
    'IS',
    'IS NOT',
    'IN',
    'NOT IN',
    'BETWEEN',
    'NOT BETWEEN'
]);
const functions = new Set([
    'ABS',
    'ROUND',
    'FLOOR',
    'CEIL',
    'CEILING',
    'COALESCE',
    'IFNULL',
    'NULLIF',
    'LOWER',
    'UPPER',
    'LENGTH',
    'CHAR_LENGTH',
    'TRIM',
    'DATE',
    'YEAR',
    'MONTH',
    'DAY',
    'HOUR',
    'DATEDIFF',
    'NOW',
    'UTC_TIMESTAMP',
    'NOT'
]);
const aggregates = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);

export interface CompiledDatabaseQuery {
    sql: string;
    parameters: Array<string | number | boolean>;
    fingerprint: string;
    rowLimit: number;
}

/** Reconstructs a small SQL subset from validated nodes; original SQL is never executed. */
export function compileDatabaseQuery(sql: string, tables: DatabaseMcpProfile['tables'], limits: DatabaseMcpLimits): CompiledDatabaseQuery {
    if (Buffer.byteLength(sql) > 16384 || hasComments(sql) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(sql)) fail();
    let ast: Node;
    try {
        const parsed: unknown = parser.astify(sql, { database: 'MariaDB' });
        ast = node(Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed);
    } catch {
        return fail();
    }
    onlyKeys(ast, ['type', 'columns', 'from', 'where', 'groupby', 'having', 'orderby', 'limit', 'distinct', 'into']);
    if (ast.type !== 'select' || (ast.distinct != null && ast.distinct !== 'DISTINCT')) fail();
    if (ast.into != null && Object.values(node(ast.into)).some((value) => value != null)) fail();
    const sources = list(ast.from);
    if (sources.length < 1 || sources.length > 6) fail();
    const aliases = new Map<string, { name: string; columns: string[] }>();
    for (const source of sources) {
        const table = node(source);
        onlyKeys(table, ['table', 'as', 'join', 'on']);
        const name = identifier(table.table);
        const policy = Object.hasOwn(tables, name) ? tables[name] : undefined;
        if (!policy) fail();
        const alias = identifier(table.as ?? name);
        if (aliases.has(alias)) fail();
        aliases.set(alias, { name, columns: policy.columns });
    }
    const parameters: CompiledDatabaseQuery['parameters'] = [];
    const outputAliases = new Map<string, string>();
    let nodes = 0;
    const expression = (value: unknown, allowAlias = false, depth = 0): string => {
        if (++nodes > 1000 || depth > 30) fail();
        const expr = node(value);
        const recurse = (child: unknown): string => expression(child, allowAlias, depth + 1);
        switch (expr.type) {
            case 'column_ref': {
                onlyKeys(expr, ['type', 'table', 'column', 'parentheses']);
                const column = identifier(expr.column);
                const source = expr.table == null ? undefined : aliases.get(identifier(expr.table));
                if (expr.table != null && !source) fail();
                if (source) {
                    if (!source.columns.includes(column)) fail();
                    return `${quote(expr.table)}.${quote(column)}`;
                }
                const matches = [...aliases.entries()].filter(([, table]) => table.columns.includes(column));
                if (matches.length === 1) return `${quote(matches[0]?.[0])}.${quote(column)}`;
                if (matches.length === 0 && allowAlias && outputAliases.has(column)) return outputAliases.get(column) ?? fail();
                return fail();
            }
            case 'number':
            case 'single_quote_string':
            case 'double_quote_string':
            case 'bool': {
                onlyKeys(expr, ['type', 'value', 'parentheses']);
                const value = expr.value;
                if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value)))
                    fail();
                // The parser rounds high-precision decimal literals before producing its AST.
                // Require strings for these values rather than silently querying a different number.
                if (
                    expr.type === 'number' &&
                    ((typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) ||
                        (typeof value === 'string' && value.replace(/[^0-9]/g, '').replace(/^0+/, '').length > 15))
                )
                    fail();
                parameters.push(
                    typeof value === 'string'
                        ? decodeString(value, expr.type === 'double_quote_string' ? '"' : "'")
                        : (value as number | boolean)
                );
                return '?';
            }
            case 'null':
                return 'NULL';
            case 'binary_expr': {
                onlyKeys(expr, ['type', 'operator', 'left', 'right', 'parentheses']);
                const operator = String(expr.operator).toUpperCase();
                if (!operators.has(operator)) fail();
                const left = recurse(expr.left);
                if (operator === 'BETWEEN' || operator === 'NOT BETWEEN') {
                    const values = list(node(expr.right).value);
                    if (values.length !== 2) fail();
                    return `(${left} ${operator} ${recurse(values[0])} AND ${recurse(values[1])})`;
                }
                return `(${left} ${operator} ${recurse(expr.right)})`;
            }
            case 'unary_expr': {
                onlyKeys(expr, ['type', 'operator', 'expr', 'parentheses']);
                if (!['+', '-', 'NOT'].includes(String(expr.operator))) fail();
                return `(${String(expr.operator)} ${recurse(expr.expr)})`;
            }
            case 'expr_list': {
                onlyKeys(expr, ['type', 'value', 'parentheses']);
                const values = list(expr.value);
                if (!values.length || values.length > 100) fail();
                return `(${values.map(recurse).join(', ')})`;
            }
            case 'aggr_func': {
                onlyKeys(expr, ['type', 'name', 'args', 'parentheses']);
                const name = String(expr.name).toUpperCase();
                if (!aggregates.has(name)) fail();
                const args = node(expr.args);
                onlyKeys(args, ['expr', 'distinct']);
                if (args.distinct != null && args.distinct !== 'DISTINCT') fail();
                const argument = node(args.expr);
                const rendered = name === 'COUNT' && argument.type === 'star' ? '*' : recurse(argument);
                return `${name}(${args.distinct ? 'DISTINCT ' : ''}${rendered})`;
            }
            case 'function': {
                onlyKeys(expr, ['type', 'name', 'args', 'parentheses']);
                const names = node(expr.name);
                onlyKeys(names, ['name']);
                const parts = list(names.name);
                if (parts.length !== 1) fail();
                const name = identifier(node(parts[0]).value).toUpperCase();
                if (!functions.has(name)) fail();
                const args = node(expr.args);
                onlyKeys(args, ['type', 'value']);
                const values = list(args.value);
                if (args.type !== 'expr_list' || values.length > 20) fail();
                return `${name}(${values.map(recurse).join(', ')})`;
            }
            default:
                return fail();
        }
    };
    const columns = list(ast.columns);
    if (!columns.length || columns.length > 50) fail();
    const selection = columns
        .map((column) => {
            const item = node(column);
            onlyKeys(item, ['expr', 'as']);
            const rendered = expression(item.expr);
            if (item.as == null) return rendered;
            const alias = identifier(item.as);
            if (outputAliases.has(alias)) fail();
            // SQL aliases are referenced by name, never by copying a parameterized expression.
            outputAliases.set(alias, quote(alias));
            return `${rendered} AS ${quote(alias)}`;
        })
        .join(', ');
    const from = sources
        .map((source, index) => {
            const table = node(source);
            const rendered = `${quote(table.table)} AS ${quote(table.as ?? table.table)}`;
            if (!index) {
                if (table.join || table.on) fail();
                return rendered;
            }
            if (!['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'JOIN'].includes(String(table.join)) || !table.on) fail();
            return `${String(table.join)} ${rendered} ON ${expression(table.on)}`;
        })
        .join(' ');
    let canonical = `SELECT ${ast.distinct ? 'DISTINCT ' : ''}${selection} FROM ${from}`;
    if (ast.where) canonical += ` WHERE ${expression(ast.where)}`;
    if (ast.groupby) {
        const group = node(ast.groupby);
        onlyKeys(group, ['columns', 'modifiers']);
        if (group.modifiers && list(group.modifiers).some((modifier) => modifier != null)) fail();
        canonical += ` GROUP BY ${list(group.columns)
            .map((item) => expression(item, true))
            .join(', ')}`;
    }
    if (ast.having) canonical += ` HAVING ${expression(ast.having, true)}`;
    if (ast.orderby)
        canonical += ` ORDER BY ${list(ast.orderby)
            .map((item) => {
                const order = node(item);
                onlyKeys(order, ['expr', 'type']);
                if (order.type != null && !['ASC', 'DESC'].includes(String(order.type))) fail();
                return `${expression(order.expr, true)} ${String(order.type ?? 'ASC')}`;
            })
            .join(', ')}`;
    let rowLimit = limits.maxRows;
    let fetchRows = rowLimit + 1;
    let offset = 0;
    if (ast.limit) {
        const limit = node(ast.limit);
        onlyKeys(limit, ['seperator', 'value']);
        const values = list(limit.value).map((item) => {
            const part = node(item);
            if (part.type !== 'number' || typeof part.value !== 'number' || !Number.isSafeInteger(part.value) || part.value < 0) fail();
            return part.value as number;
        });
        if (values.length < 1 || values.length > 2 || !['', ',', 'offset'].includes(String(limit.seperator))) fail();
        const requested = values[limit.seperator === ',' ? 1 : 0] ?? fail();
        offset = values.length === 2 ? (values[limit.seperator === ',' ? 0 : 1] ?? fail()) : 0;
        if (offset > 10000) fail();
        rowLimit = Math.min(requested, limits.maxRows);
        fetchRows = requested > limits.maxRows ? rowLimit + 1 : rowLimit;
    }
    canonical += ` LIMIT ${fetchRows} OFFSET ${offset}`;
    return { sql: canonical, parameters, rowLimit, fingerprint: createHash('sha256').update(canonical).digest('hex') };
}
