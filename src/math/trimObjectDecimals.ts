import { trimDecimals } from './trimDecimals.js';

export const trimObjectDecimals = <T>(object: T, precision: number) => {
    let newObject = { ...object };

    for (const key in object) {
        if (typeof object[key] === 'number' && +object[key] > 0) {
            const value = object[key] as number;
            newObject = { ...newObject, [key]: trimDecimals(value, precision) };
        } else {
            newObject = { ...newObject, [key]: object[key] };
        }
    }

    return newObject;
};
