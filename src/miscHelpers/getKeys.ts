// Get all the keys from an object in an array and avoid the implicit any index
export const getKeys = <O extends object>(obj: O): (keyof O)[] => {
    return Object.keys(obj) as (keyof O)[];
};
