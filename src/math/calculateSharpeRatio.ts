export const calculateSharpeRatio = (returns: number[]): number => {
    const averageReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const standardDeviation = Math.sqrt(returns.reduce((sum, r) => sum + (r - averageReturn) ** 2, 0) / returns.length);
    const sharpeRatio = averageReturn && standardDeviation ? averageReturn / standardDeviation : 0;
    return sharpeRatio;
};
