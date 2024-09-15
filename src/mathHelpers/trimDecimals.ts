export const trimDecimals = (value: number, precision = 2) => {
    const pow = 10 ** precision;
    return Math.round(value * pow) / pow;
};
