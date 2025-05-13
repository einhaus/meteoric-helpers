export const roundToClosestDivisible = (num: number, divisor: number): number => {
    return Math.round(num / divisor) * divisor;
};
