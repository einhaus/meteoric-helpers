import { sumNumberArrayFast } from './sumNumberArrayFast.js';

export const averageNumberArrayFast = (array: number[]): number => {
    return !array.length ? 0 : sumNumberArrayFast(array) / array.length;
};
