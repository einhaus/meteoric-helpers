import { marketOpenHour, marketOpenMinute, marketCloseHour, marketCloseMinute } from './constants.js';
import { getZoneCalendarMs, resolveZoneCalendarMs } from './internal/zoneWallClock.js';

export const getOpenOrCloseUnix = (timestamp: number, openOrClose: 'open' | 'close') => {
    const sourceMs = timestamp * 1000;
    const wallClock = new Date(getZoneCalendarMs(sourceMs, 'America/New_York'));
    if (openOrClose === 'open') wallClock.setUTCHours(marketOpenHour, marketOpenMinute, 0, 0);
    else wallClock.setUTCHours(marketCloseHour, marketCloseMinute, 0, 0);
    return resolveZoneCalendarMs(wallClock.getTime(), 'America/New_York', sourceMs) / 1000;
};
