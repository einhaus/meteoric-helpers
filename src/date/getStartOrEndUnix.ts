import type { DateInterval } from './constants.js';
import dayjs from './dayjsTimezone.js';
import { type DateTimezone, getZoneCalendarMs, resolveZoneCalendarMs } from './internal/zoneWallClock.js';

export const getStartOrEndUnix = (
    timestamp: number | null,
    startOrEnd: 'start' | 'end',
    intervalType: DateInterval,
    timezone?: DateTimezone
) => {
    const ms = timestamp == null ? Date.now() : timestamp * 1000;
    const date = timezone ? dayjs.utc(getZoneCalendarMs(ms, timezone)) : dayjs(ms);
    const boundary = startOrEnd === 'start' ? date.startOf(intervalType) : date.endOf(intervalType);
    return timezone ? Math.floor(resolveZoneCalendarMs(boundary.valueOf(), timezone, ms) / 1000) : boundary.unix();
};
