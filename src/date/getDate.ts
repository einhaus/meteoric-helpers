import { type DateInterval, ymd, ymdhms, ymdhmss } from './constants.js';
import dayjs from 'dayjs';

// eslint-disable-next-line complexity
export const getDate = (config?: {
    format?:
        | 'ymd'
        | 'ymdhms'
        | 'mdy'
        | 'ymdhmss'
        | 'iso'
        | 'iso8601'
        | 'unix'
        | 'yyyy'
        | 'readable1'
        | 'readable2'
        | 'weekdayMonthDay'
        | 'weekdayMonthDayYear'
        | 'monthDayYear';
    startOf?: 'day' | 'week' | 'month' | 'year';
    endOf?: 'day' | 'week' | 'month' | 'year';
    timezone?: 'Etc/UTC' | 'America/New_York' | 'America/Chicago' | null;
    date?: string | number | Date;
    operator?: '+' | '-';
    interval?: number;
    intervalType?: DateInterval;
}) => {
    const { format: returnFormat = 'ymd', startOf, endOf, timezone, date: inputDateTime, operator, interval, intervalType } = config ?? {};

    // This is faster than using dayjs, so for simple cases we can use this
    if (
        !inputDateTime &&
        !operator &&
        !timezone &&
        !startOf &&
        !endOf &&
        (returnFormat === 'ymd' ||
            returnFormat === 'ymdhms' ||
            returnFormat === 'ymdhmss' ||
            returnFormat === 'mdy' ||
            returnFormat === 'yyyy')
    ) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        if (returnFormat === 'ymd') return `${year}-${month}-${day}`;
        if (returnFormat === 'ymdhms') return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        if (returnFormat === 'ymdhmss') return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${now.getMilliseconds()}`;
        if (returnFormat === 'mdy') return `${month}-${day}-${year}`;
        if (returnFormat === 'yyyy') return `${year}`;
    }

    let dateObject = inputDateTime && typeof inputDateTime !== 'number' ? dayjs(inputDateTime) : null;
    dateObject = typeof inputDateTime === 'number' ? dayjs.unix(inputDateTime) : dateObject;
    dateObject = !dateObject ? dayjs() : dateObject;

    if (operator && interval && intervalType)
        dateObject = operator === '+' ? dateObject.add(interval, intervalType) : dateObject.subtract(interval, intervalType);

    if (timezone) dateObject = dateObject.tz(timezone);
    if (startOf) dateObject = dateObject.startOf(startOf);
    if (endOf) dateObject = dateObject.endOf(endOf);

    let dateFormatted: string | number = returnFormat === 'ymd' ? dateObject.format(ymd) : '';
    dateFormatted = returnFormat === 'ymdhms' ? dateObject.format(ymdhms) : dateFormatted;
    dateFormatted = returnFormat === 'ymdhmss' ? dateObject.format(ymdhmss) : dateFormatted;
    dateFormatted = returnFormat === 'iso' ? dateObject.toISOString() : dateFormatted;
    dateFormatted = returnFormat === 'iso8601' ? dateObject.format() : dateFormatted;
    dateFormatted = returnFormat === 'unix' ? dateObject.unix().toString() : dateFormatted;
    dateFormatted = returnFormat === 'mdy' ? dateObject.format('MM-DD-YYYY') : dateFormatted;
    dateFormatted = returnFormat === 'readable1' ? dateObject.format('ddd, MMM D, YYYY h:mm A') : dateFormatted;
    dateFormatted = returnFormat === 'readable2' ? dateObject.format('MMM D, YYYY h:mm A') : dateFormatted;
    dateFormatted = returnFormat === 'weekdayMonthDay' ? dateObject.format('dddd MMM D') : dateFormatted;
    dateFormatted = returnFormat === 'weekdayMonthDayYear' ? dateObject.format('dddd MMM D YYYY') : dateFormatted;
    dateFormatted = returnFormat === 'monthDayYear' ? dateObject.format('MMMM D, YYYY') : dateFormatted;
    return dateFormatted;
};
