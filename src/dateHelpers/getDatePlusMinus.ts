import { ymd, ymdhms, type DateInterval } from './constants.js';
import dayjs from 'dayjs';

export const getDatePlusMinus = (
    operator: '+' | '-',
    interval: number,
    intervalType: DateInterval,
    returnFormat: 'ymd' | 'unix' | 'ymdhms' = 'ymd',
    startOrEndOfDay?: 'start' | 'end' | null,
    inputDateTime: string | Date | number = ''
    // eslint-disable-next-line max-params
): string => {
    let dateObject = inputDateTime && typeof inputDateTime === 'string' ? dayjs(inputDateTime) : dayjs();
    dateObject = inputDateTime && typeof inputDateTime === 'number' ? dayjs.unix(inputDateTime) : dateObject;
    dateObject = operator === '+' ? dateObject.add(interval, intervalType) : dateObject.subtract(interval, intervalType);
    dateObject = startOrEndOfDay === 'start' ? dateObject.startOf('day') : dateObject;
    dateObject = startOrEndOfDay === 'end' ? dateObject.endOf('day') : dateObject;
    let dateFormatted: string | number = returnFormat === 'ymd' ? dateObject.format(ymd) : '';
    dateFormatted = returnFormat === 'ymdhms' ? dateObject.format(ymdhms) : dateFormatted;
    dateFormatted = returnFormat === 'ymdhms' ? dateObject.format(ymdhms) : dateFormatted;
    return dateFormatted;
};
