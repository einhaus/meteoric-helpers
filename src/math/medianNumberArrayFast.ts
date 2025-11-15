import { medianNumberArray } from './medianNumberArray.js';
import { trimDecimals } from './trimDecimals.js';

export const medianNumberArrayFast = (values: number[]): number => {
    if (!values.length) return 0;
    const median = medianNumberArray(values);
    return trimDecimals(median);
};
