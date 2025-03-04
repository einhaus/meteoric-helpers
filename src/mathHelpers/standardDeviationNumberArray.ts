import { medianNumberArray } from './medianNumberArray.js';

export function standardDeviationNumberArray(values: number[]): number {
    const avg = medianNumberArray(values);
    const squareDiffs = values.map((value) => Math.pow(value - avg, 2));
    const avgSquareDiff = medianNumberArray(squareDiffs);
    return Math.sqrt(avgSquareDiff);
}
