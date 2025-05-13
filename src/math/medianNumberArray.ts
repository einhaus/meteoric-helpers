export const medianNumberArray = (arr: number[]): number => {
    const middle = Math.floor(arr.length / 2);
    arr = [...arr].sort((a, b) => a - b);
    const median = arr.length % 2 !== 0 ? arr[middle] : (arr[middle - 1]! + arr[middle]!) / 2;
    if (median === undefined) throw new Error('medianNumberArray: median is undefined');
    return median;
};
