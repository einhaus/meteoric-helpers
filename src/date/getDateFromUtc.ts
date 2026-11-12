import { ymd, ymdhm, ymdhms } from './constants.js';
import dayjs from './dayjsTimezone.js';
import { getZoneCalendarMs } from './internal/zoneWallClock.js';

export const getDateFromUtc = (
    dateTime: string | Date | number,
    returnFormat: 'ymd' | 'ymdhms' | 'unix' | 'ymdhm' | 'readable1' = 'ymd',
    timezone?: 'Etc/UTC' | 'America/New_York' | 'America/Chicago' | 'America/Denver' | 'America/Los_Angeles'
): string | number => {
    let dateObject = dayjs.utc(dateTime);
    // Numeric input remains milliseconds; Unix output remains seconds and must not depend on the display zone.
    if (returnFormat === 'unix') return dateObject.unix();
    if (timezone && dateObject.isValid()) dateObject = dayjs.utc(getZoneCalendarMs(dateObject.valueOf(), timezone));
    let dateFormatted: string | number = returnFormat === 'ymd' ? dateObject.format(ymd) : '';
    dateFormatted = returnFormat === 'ymdhm' ? dateObject.format(ymdhm) : dateFormatted;
    dateFormatted = returnFormat === 'ymdhms' ? dateObject.format(ymdhms) : dateFormatted;
    dateFormatted = returnFormat === 'readable1' ? dateObject.format('ddd, MMM D, YYYY h:mm A') : dateFormatted;

    return dateFormatted;
};
