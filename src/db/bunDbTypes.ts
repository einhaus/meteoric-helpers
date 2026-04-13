import type { Insertable } from './dbUtilityTypes.js';

type Simplify<T> = { [Key in keyof T]: T[Key] } & {};
type StringKeyOf<T> = Extract<keyof T, string>;
type NonUndefined<T> = Exclude<T, undefined>;
type NonNullish<T> = Exclude<T, null | undefined>;
type ComparableValue = string | number | bigint | Date;
type ColumnArray<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> = readonly BunDbColumnName<Schema, Table>[];

export type BunDbDialect = 'mysql' | 'postgres';

/**
 * Table-level schema contract for generated database types.
 *
 * The generator should emit one of these per table so the wrapper can bind:
 * - the real row shape
 * - insert/update payloads
 * - optional primary key metadata
 */
export interface BunDbSchemaTable<
    Row extends object,
    Insert extends object = Insertable<Row>,
    Update extends object = Partial<Insert>,
    PrimaryKey extends StringKeyOf<Row> = never
> {
    row: Row;
    insert: Insert;
    update: Update;
    primaryKey?: PrimaryKey | readonly PrimaryKey[];
}

/**
 * A generated schema should look like:
 *
 * export interface AppSchema {
 *   users: BunDbSchemaTable<UsersRow, UsersRowInsert, UsersRowUpdate, 'id'>;
 *   orders: BunDbSchemaTable<OrdersRow, OrdersRowInsert, OrdersRowUpdate, 'id'>;
 * }
 */
type BunDbSchemaTableDefinition = BunDbSchemaTable<
    Record<string, unknown>,
    Record<string, unknown>,
    Record<string, unknown>,
    string
>;

export type BunDbSchema = object;

export type BunDbTableName<Schema extends BunDbSchema> = Extract<
    {
        [Table in keyof Schema]: Schema[Table] extends BunDbSchemaTableDefinition ? Table : never;
    }[keyof Schema],
    string
>;

export type BunDbTableDefinition<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> = Extract<
    Schema[Table],
    BunDbSchemaTableDefinition
>;

export type BunDbRow<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> = BunDbTableDefinition<Schema, Table>['row'];

export type BunDbInsert<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> = BunDbTableDefinition<Schema, Table>['insert'];

export type BunDbUpdate<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> = BunDbTableDefinition<Schema, Table>['update'];

export type BunDbColumnName<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> = StringKeyOf<BunDbRow<Schema, Table>>;

export type BunDbUpdateColumnName<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> = Extract<
    keyof BunDbUpdate<Schema, Table>,
    string
>;

export type BunDbColumnValue<
    Schema extends BunDbSchema,
    Table extends BunDbTableName<Schema>,
    Column extends BunDbColumnName<Schema, Table>
> = BunDbRow<Schema, Table>[Column];

export type BunDbPrimaryKey<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> = BunDbTableDefinition<
    Schema,
    Table
>['primaryKey'];

export interface BunDbRuntimeTableMetadata<PrimaryKey extends string = string> {
    primaryKey?: PrimaryKey | readonly PrimaryKey[];
}

export type BunDbRuntimeSchemaMetadata<Schema extends BunDbSchema> = {
    [Table in BunDbTableName<Schema>]?: BunDbRuntimeTableMetadata<BunDbColumnName<Schema, Table>>;
};

type BunDbSinglePrimaryKeyColumn<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> =
    BunDbPrimaryKey<Schema, Table> extends readonly unknown[]
        ? never
        : Extract<BunDbPrimaryKey<Schema, Table>, BunDbColumnName<Schema, Table>>;

export type BunDbInsertId<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> = [
    BunDbSinglePrimaryKeyColumn<Schema, Table>
] extends [never]
    ? unknown
    : BunDbRow<Schema, Table>[BunDbSinglePrimaryKeyColumn<Schema, Table>];

export interface BunDbSqlExpression {
    kind: 'expression';
    sql: string;
}

export const bunDbExpr = (sql: string): BunDbSqlExpression => ({
    kind: 'expression',
    sql
});

type BunDbStringOperators<Value> = NonNullish<Value> extends string ? 'LIKE' | 'NOT LIKE' : never;
type BunDbComparableOperators<Value> = NonNullish<Value> extends ComparableValue ? '>' | '>=' | '<' | '<=' : never;
type BunDbNullOperators<Value> = null extends NonUndefined<Value> ? 'IS' | 'IS NOT' : never;

type BunDbScalarWhereOperator<Value> =
    | '='
    | '!='
    | '<>'
    | BunDbStringOperators<Value>
    | BunDbComparableOperators<Value>
    | BunDbNullOperators<Value>;

type BunDbScalarWhereConditionForColumn<
    Schema extends BunDbSchema,
    Table extends BunDbTableName<Schema>,
    Column extends BunDbColumnName<Schema, Table>
> = {
    column: Column;
    operator?: BunDbScalarWhereOperator<BunDbColumnValue<Schema, Table, Column>>;
    value: BunDbColumnValue<Schema, Table, Column>;
};

type BunDbSetWhereConditionForColumn<
    Schema extends BunDbSchema,
    Table extends BunDbTableName<Schema>,
    Column extends BunDbColumnName<Schema, Table>
> = {
    column: Column;
    operator: 'IN' | 'NOT IN';
    value: readonly NonUndefined<BunDbColumnValue<Schema, Table, Column>>[];
};

type BunDbRangeWhereConditionForColumn<
    Schema extends BunDbSchema,
    Table extends BunDbTableName<Schema>,
    Column extends BunDbColumnName<Schema, Table>
> =
    NonNullish<BunDbColumnValue<Schema, Table, Column>> extends ComparableValue
        ? {
              column: Column;
              operator: 'BETWEEN' | 'NOT BETWEEN';
              value: readonly [NonNullish<BunDbColumnValue<Schema, Table, Column>>, NonNullish<BunDbColumnValue<Schema, Table, Column>>];
          }
        : never;

type BunDbLeafWhereCondition<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> = {
    [Column in BunDbColumnName<Schema, Table>]:
        | BunDbScalarWhereConditionForColumn<Schema, Table, Column>
        | BunDbSetWhereConditionForColumn<Schema, Table, Column>
        | BunDbRangeWhereConditionForColumn<Schema, Table, Column>;
}[BunDbColumnName<Schema, Table>];

export interface BunDbGroupedWhereCondition<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> {
    group: readonly BunDbWhereCondition<Schema, Table>[];
    operator?: 'AND' | 'OR';
}

export type BunDbWhereCondition<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> =
    | BunDbLeafWhereCondition<Schema, Table>
    | BunDbGroupedWhereCondition<Schema, Table>;

export interface BunDbOrderBy<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> {
    column: BunDbColumnName<Schema, Table>;
    direction?: 'ASC' | 'DESC';
}

export type BunDbSelectResult<
    Schema extends BunDbSchema,
    Table extends BunDbTableName<Schema>,
    Columns extends ColumnArray<Schema, Table> | undefined
> = Columns extends ColumnArray<Schema, Table> ? Pick<BunDbRow<Schema, Table>, Columns[number]>[] : BunDbRow<Schema, Table>[];

export interface BunDbSelectConfig<
    Schema extends BunDbSchema,
    Table extends BunDbTableName<Schema>,
    Columns extends ColumnArray<Schema, Table> | undefined = undefined
> {
    columns?: Columns;
    where?: BunDbWhereCondition<Schema, Table> | readonly BunDbWhereCondition<Schema, Table>[];
    whereOperator?: 'AND' | 'OR';
    orderBy?: BunDbOrderBy<Schema, Table> | readonly BunDbOrderBy<Schema, Table>[];
    limit?: number;
    offset?: number;
    forUpdate?: boolean;
}

export interface BunDbUpsertConfig<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> {
    conflictTarget?: readonly BunDbColumnName<Schema, Table>[];
    updateColumns?: readonly BunDbUpdateColumnName<Schema, Table>[];
    update?: BunDbAssignmentShape<Schema, Table>;
}

export interface BunDbInsertOptions<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> {
    ignore?: boolean;
    upsert?: BunDbUpsertConfig<Schema, Table>;
}

export interface BunDbUpdateConfig<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> {
    set: BunDbAssignmentShape<Schema, Table>;
    where?: BunDbWhereCondition<Schema, Table> | readonly BunDbWhereCondition<Schema, Table>[];
    whereOperator?: 'AND' | 'OR';
    allowFullTableUpdate?: boolean;
}

export interface BunDbDeleteConfig<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> {
    where?: BunDbWhereCondition<Schema, Table> | readonly BunDbWhereCondition<Schema, Table>[];
    whereOperator?: 'AND' | 'OR';
    allowFullTableDelete?: boolean;
}

export interface BunDbWriteResult<InsertId = unknown> {
    affectedRows: number;
    insertId?: InsertId;
}

/**
 * Public wrapper contract for a schema-driven Bun SQL database client.
 *
 * The key design choice here is that the table name is a generic parameter to each
 * method rather than a plain string inside a config object. That lets TypeScript bind
 * table -> columns -> row/insert/update shapes and reject invalid column names.
 */
export interface BunDbClient<Schema extends BunDbSchema> {
    readonly dialect: BunDbDialect;

    raw: <TResult = unknown[]>(strings: TemplateStringsArray, ...values: readonly unknown[]) => Promise<TResult>;

    unsafe: <TResult = unknown>(queryString: string, values?: readonly unknown[]) => Promise<TResult>;

    query: <TResult = unknown>(queryString: string, values?: readonly unknown[]) => Promise<TResult>;

    select: <Table extends BunDbTableName<Schema>, Columns extends ColumnArray<Schema, Table> | undefined = undefined>(
        table: Table,
        config?: BunDbSelectConfig<Schema, Table, Columns>
    ) => Promise<BunDbSelectResult<Schema, Table, Columns>>;

    selectOne: <Table extends BunDbTableName<Schema>, Columns extends ColumnArray<Schema, Table> | undefined = undefined>(
        table: Table,
        config?: BunDbSelectConfig<Schema, Table, Columns>
    ) => Promise<BunDbSelectResult<Schema, Table, Columns>[number] | undefined>;

    insert: <Table extends BunDbTableName<Schema>>(
        table: Table,
        values: BunDbInsert<Schema, Table>,
        options?: BunDbInsertOptions<Schema, Table>
    ) => Promise<BunDbWriteResult<BunDbInsertId<Schema, Table>>>;

    insertMany: <Table extends BunDbTableName<Schema>>(
        table: Table,
        values: readonly BunDbInsert<Schema, Table>[],
        options?: BunDbInsertOptions<Schema, Table>
    ) => Promise<BunDbWriteResult<BunDbInsertId<Schema, Table>>>;

    update: <Table extends BunDbTableName<Schema>>(table: Table, config: BunDbUpdateConfig<Schema, Table>) => Promise<BunDbWriteResult>;

    delete: <Table extends BunDbTableName<Schema>>(table: Table, config: BunDbDeleteConfig<Schema, Table>) => Promise<BunDbWriteResult>;

    transaction: <TResult>(callback: (tx: BunDbTransactionClient<Schema>) => Promise<TResult>) => Promise<TResult>;

    reserve: <TResult>(callback: (connection: BunDbReservedConnectionClient<Schema>) => Promise<TResult>) => Promise<TResult>;

    close: () => Promise<void>;
}

export interface BunDbTransactionClient<Schema extends BunDbSchema> extends Omit<BunDbClient<Schema>, 'close' | 'reserve'> {
    savepoint: <TResult>(callback: (tx: BunDbTransactionClient<Schema>) => Promise<TResult>) => Promise<TResult>;
}

export type BunDbReservedConnectionClient<Schema extends BunDbSchema> = Omit<BunDbClient<Schema>, 'close'>;

export type BunDbReservedConnectionHandle<Schema extends BunDbSchema> = BunDbReservedConnectionClient<Schema> & {
    release: () => Promise<void>;
};

/**
 * Helper type for generated files that want to expose update payloads but avoid
 * deeply nested mapped/intersection output in editor hovers.
 */
export type BunDbAssignmentValue<
    Schema extends BunDbSchema,
    Table extends BunDbTableName<Schema>,
    Column extends BunDbUpdateColumnName<Schema, Table>
> = BunDbUpdate<Schema, Table>[Column] | BunDbSqlExpression;

export type BunDbAssignmentShape<Schema extends BunDbSchema, Table extends BunDbTableName<Schema>> = Simplify<
    Partial<{
        [Column in BunDbUpdateColumnName<Schema, Table>]: BunDbAssignmentValue<Schema, Table, Column>;
    }>
>;

export type BunDbUpdateShape<T extends object, ImmutableKeys extends keyof T = never> = Simplify<
    Partial<Omit<T, ImmutableKeys>>
>;
