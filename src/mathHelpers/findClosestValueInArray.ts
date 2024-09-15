export const findClosestValueInArray = (array: number[], target: number): number => {
    return array.reduce((prev, curr) => (Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev));
};
