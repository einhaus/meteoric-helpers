import { ymd, ymdhms, ymdhmss } from './constants.js';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(timezone);

export const getDateString = (
    returnFormat: 'ymd' | 'ymdhms' | 'ymdhmss' | 'iso' | 'iso8601' | 'unix' | 'readable1' = 'ymd',
    startOrEndOfDay?: 'start' | 'end' | null,
    timezone?: 'Etc/UTC' | 'America/New_York' | 'America/Chicago' | null,
    inputDateTime: string | number | Date = ''
) => {
    let dateObject = inputDateTime && typeof inputDateTime !== 'number' ? dayjs(inputDateTime) : dayjs();
    dateObject = typeof inputDateTime === 'number' ? dayjs.unix(inputDateTime) : dateObject;
    if (timezone) dateObject = dateObject.tz(timezone);

    dateObject = startOrEndOfDay === 'start' ? dateObject.startOf('day') : dateObject;
    dateObject = startOrEndOfDay === 'end' ? dateObject.endOf('day') : dateObject;

    let dateFormatted: string | number = returnFormat === 'ymd' ? dateObject.format(ymd) : '';
    dateFormatted = returnFormat === 'ymdhms' ? dateObject.format(ymdhms) : dateFormatted;
    dateFormatted = returnFormat === 'ymdhmss' ? dateObject.format(ymdhmss) : dateFormatted;
    dateFormatted = returnFormat === 'iso' ? dateObject.toISOString() : dateFormatted;
    dateFormatted = returnFormat === 'iso8601' ? dateObject.format() : dateFormatted;
    dateFormatted = returnFormat === 'readable1' ? dateObject.format('ddd, MMM D, YYYY h:mm A') : dateFormatted;
    dateFormatted = returnFormat === 'unix' ? dateObject.unix().toString() : dateFormatted;

    return dateFormatted;
};
