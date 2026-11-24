import dayjs from 'dayjs';
import { type DateTimezone, getZoneWallClock, parseZoneCalendarMs } from './internal/zoneWallClock.js';

export const getDateNumericalTime = (inputDateTime: string | number | Date = '', timezone?: DateTimezone) => {
    if (timezone) {
        let ms: number;
        if (typeof inputDateTime === 'number') ms = inputDateTime * 1000;
        else if (inputDateTime instanceof Date) ms = inputDateTime.getTime();
        else if (!inputDateTime) ms = Date.now();
        else if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(inputDateTime)) ms = Date.parse(inputDateTime);
        else ms = parseZoneCalendarMs(inputDateTime, timezone);
        const { hours, minutes } = getZoneWallClock(ms / 1000, timezone);
        return Number(hours) * 100 + Number(minutes);
    }
    const date = typeof inputDateTime === 'number' ? dayjs.unix(inputDateTime) : dayjs(inputDateTime || undefined);
    return date.hour() * 100 + date.minute();
};
