export const omitProperty = <T, K extends keyof T>(obj: T, prop: K): Omit<T, K> => {
    const { [prop]: _, ...rest } = obj;
    return rest;
};
