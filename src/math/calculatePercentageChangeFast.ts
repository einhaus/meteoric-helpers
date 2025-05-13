import { trimDecimals } from './trimDecimals.js';

export const calculatePercentageChangeFast = (startingNumber: number, endingNumber: number, decimalPlaces = 2) => {
    const percentage = startingNumber && endingNumber ? ((endingNumber - startingNumber) / startingNumber) * 100 : 0;

    return trimDecimals(percentage, decimalPlaces);
};
