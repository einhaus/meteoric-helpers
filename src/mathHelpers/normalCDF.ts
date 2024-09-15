import { erf } from './erf.js';

export const normalCDF = (x: number): number => {
    return (1.0 + erf(x / Math.sqrt(2))) / 2.0;
};
