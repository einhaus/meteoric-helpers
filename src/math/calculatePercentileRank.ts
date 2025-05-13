export const calculatePercentileRank = (config: { n: number; x: number; array: number[]; roundDigits?: number }): number => {
    const { n, x, array, roundDigits = 0 } = config;
    // Count the number of values in the array less than x
    const c = array.reduce((a, b) => (b < x ? ++a : a), 0);
    // Count the number of values identical to x
    const f = array.reduce((a, b) => (b === x ? ++a : a), 0);
    const percentile = ((c + 0.5 * f) / n) * 100;
    return Number(percentile.toFixed(roundDigits));
};
