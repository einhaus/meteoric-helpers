import type { DateInterval } from './constants.js';
import dayjs from 'dayjs';

export const getDiffBetweenDates = (date1: string | number, date2: string | number, intervalType: DateInterval): number => {
    const date1Object = typeof date1 === 'number' ? dayjs.unix(date1) : dayjs(date1);
    const date2Object = typeof date2 === 'number' ? dayjs.unix(date2) : dayjs(date2);

    return date1Object.diff(date2Object, intervalType);
};
