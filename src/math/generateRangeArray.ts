export const generateRangeArray = (start: number, end: number, step = 1): number[] => {
    const output: number[] = [];
    const totalSteps = Math.floor((end - start) / step);

    for (let i = 0; i <= totalSteps; i++) {
        const value = Number((start + i * step).toFixed(10));
        output.push(value);
    }

    return output;
};
