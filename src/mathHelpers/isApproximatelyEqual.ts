export const isApproximatelyEqual = (a: number, b: number, epsilon = 0.0005): boolean => {
    return Math.abs(a - b) <= a * epsilon;
};
