import type { DateInterval } from './constants.js';
import dayjs from './dayjsTimezone.js';
import { type DateTimezone, getZoneCalendarMs, parseZoneCalendarMs } from './internal/zoneWallClock.js';

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

const instantMs = (value: string | number, zone: DateTimezone): number => {
    if (typeof value === 'number') return value * 1000;
    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return Date.parse(value);
    return parseZoneCalendarMs(value, zone);
};

export const getDiffBetweenDates = (
    date1: string | number,
    date2: string | number,
    intervalType: DateInterval,
    timezone?: DateTimezone
): number => {
    const calendarInterval = ['day', 'week', 'month', 'year'].includes(intervalType);
    if (calendarInterval && typeof date1 === 'string' && typeof date2 === 'string' && dateOnly.test(date1) && dateOnly.test(date2)) {
        // Two calendar labels have no elapsed-time offset to apply.
        return dayjs.utc(date1).diff(dayjs.utc(date2), intervalType);
    }
    if (timezone) {
        const first = instantMs(date1, timezone);
        const second = instantMs(date2, timezone);
        if (!Number.isFinite(first) || !Number.isFinite(second)) return Number.NaN;
        const a = calendarInterval ? getZoneCalendarMs(first, timezone) : first;
        const b = calendarInterval ? getZoneCalendarMs(second, timezone) : second;
        return dayjs.utc(a).diff(dayjs.utc(b), intervalType);
    }
    const date1Object = typeof date1 === 'number' ? dayjs.unix(date1) : dayjs(date1);
    const date2Object = typeof date2 === 'number' ? dayjs.unix(date2) : dayjs(date2);
    return date1Object.diff(date2Object, intervalType);
};
