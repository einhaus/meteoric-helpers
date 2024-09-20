export const getKeyByValue = <T extends object, TU extends keyof T>(object: T, value: string | number) => {
    return Object.keys(object).find((key) => object[key as TU] === value);
};
