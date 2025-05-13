export const omitProperty = <T, K extends keyof T>(obj: T, prop: K): Omit<T, K> => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/naming-convention
    const { [prop]: _, ...rest } = obj;
    return rest;
};
