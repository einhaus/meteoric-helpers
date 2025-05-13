export const cartesianProduct = <T>(arrays: T[][]): T[][] => {
    return arrays.reduce<T[][]>((acc, curr) => acc.map((x) => curr.map((y) => x.concat([y]))).reduce((a, b) => a.concat(b), []), [[]]);
};
