import { ymd, ymdhm, ymdhms } from './constants.js';
import dayjs from './dayjsTimezone.js';

export const getDateFromUtc = (
    dateTime: string | Date | number,
    returnFormat: 'ymd' | 'ymdhms' | 'unix' | 'ymdhm' | 'readable1' = 'ymd',
    timezone?: 'Etc/UTC' | 'America/New_York' | 'America/Chicago' | 'America/Denver' | 'America/Los_Angeles'
): string | number => {
    let dateObject = dayjs.utc(dateTime);
    if (timezone) dateObject = dateObject.tz(timezone);
    let dateFormatted: string | number = returnFormat === 'ymd' ? dateObject.format(ymd) : '';
    dateFormatted = returnFormat === 'ymdhm' ? dateObject.format(ymdhm) : dateFormatted;
    dateFormatted = returnFormat === 'ymdhms' ? dateObject.format(ymdhms) : dateFormatted;
    dateFormatted = returnFormat === 'unix' ? dateObject.unix() : dateFormatted;
    dateFormatted = returnFormat === 'readable1' ? dateObject.format('ddd, MMM D, YYYY h:mm A') : dateFormatted;

    return dateFormatted;
};
