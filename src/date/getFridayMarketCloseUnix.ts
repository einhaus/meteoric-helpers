import { marketCloseDay, marketCloseHour, marketCloseMinute } from './constants.js';
import { getZoneCalendarMs, resolveZoneCalendarMs } from './internal/zoneWallClock.js';

export const getFridayMarketCloseUnix = (timestamp: number) => {
    const sourceMs = timestamp * 1000;
    const friday = new Date(getZoneCalendarMs(sourceMs, 'America/New_York'));
    friday.setUTCDate(friday.getUTCDate() + marketCloseDay - friday.getUTCDay());
    friday.setUTCHours(marketCloseHour, marketCloseMinute, 0, 0);
    return resolveZoneCalendarMs(friday.getTime(), 'America/New_York', sourceMs) / 1000;
};
