export const findIndexFromMapValue = <T>(map: Map<T, number>, value: T): number | undefined => {
    return map.get(value);
};
