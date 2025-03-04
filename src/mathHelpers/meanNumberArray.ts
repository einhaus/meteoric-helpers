/**
 * Helper function to compute the mean of an array of numbers.
 */
export function meanNumberArray(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
