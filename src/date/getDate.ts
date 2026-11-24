import { type DateInterval, ymd, ymdhms, ymdhmss } from './constants.js';
import dayjs from './dayjsTimezone.js';
import {
    type DateTimezone,
    formatZoneOffset,
    getZoneCalendarMs,
    parseZoneCalendarMs,
    resolveZoneCalendarMs
} from './internal/zoneWallClock.js';

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
    /** Zone in which to display the result or select its calendar boundaries. */
    timezone?: DateTimezone | null;
    /** Origin of a timezone-free ISO calendar string. Without it, legacy strings use the process clock. */
    inputTimezone?: DateTimezone;
    date?: string | number | Date;
    operator?: '+' | '-';
    interval?: number;
    intervalType?: DateInterval;
}) => {
    const {
        format: returnFormat = 'ymd',
        startOf,
        endOf,
        timezone,
        inputTimezone,
        date: inputDateTime,
        operator,
        interval,
        intervalType
    } = config ?? {};

    if (inputTimezone && typeof inputDateTime !== 'string') throw new Error('inputTimezone requires a wall-clock string');
    // This is faster than using dayjs, so for simple cases we can use this
    if (
        (inputDateTime == null || inputDateTime === '') &&
        !inputTimezone &&
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

    const instant = inputTimezone && typeof inputDateTime === 'string' ? parseZoneCalendarMs(inputDateTime, inputTimezone) : inputDateTime;
    let dateObject =
        typeof instant === 'number' && !inputTimezone
            ? dayjs.unix(instant)
            : dayjs(instant == null || instant === '' ? undefined : instant);

    if (operator && interval && intervalType) {
        const amount = operator === '+' ? interval : -interval;
        const calendarZone = inputTimezone ?? timezone;
        if (
            calendarZone &&
            dateObject.isValid() &&
            (intervalType === 'day' || intervalType === 'week' || intervalType === 'month' || intervalType === 'year')
        ) {
            const sourceMs = dateObject.valueOf();
            const calendar = dayjs.utc(getZoneCalendarMs(sourceMs, calendarZone)).add(amount, intervalType);
            dateObject = dayjs(resolveZoneCalendarMs(calendar.valueOf(), calendarZone, sourceMs));
        } else {
            dateObject = dateObject.add(amount, intervalType);
        }
    }

    if (timezone && dateObject.isValid()) {
        // Keep the instant separate from its wall clock: Dayjs .tz() reparses through the host zone and can shift both
        // by an hour inside that zone's spring-forward gap. UTC calendar arithmetic cannot fall into a host-local gap.
        let instantMs = dateObject.valueOf();
        dateObject = dayjs.utc(getZoneCalendarMs(instantMs, timezone));
        if (startOf) dateObject = dateObject.startOf(startOf);
        if (endOf) dateObject = dateObject.endOf(endOf);
        if (startOf || endOf) {
            instantMs = resolveZoneCalendarMs(dateObject.valueOf(), timezone, instantMs);
            dateObject = dayjs.utc(getZoneCalendarMs(instantMs, timezone));
        }

        if (returnFormat === 'iso') return new Date(instantMs).toISOString();
        if (returnFormat === 'unix') return Math.floor(instantMs / 1000).toString();
        if (returnFormat === 'iso8601')
            return dateObject.format('YYYY-MM-DDTHH:mm:ss') + formatZoneOffset(dateObject.valueOf() - instantMs);
    } else {
        if (startOf) dateObject = dateObject.startOf(startOf);
        if (endOf) dateObject = dateObject.endOf(endOf);
    }

    if (returnFormat === 'yyyy') return dateObject.format('YYYY');
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
