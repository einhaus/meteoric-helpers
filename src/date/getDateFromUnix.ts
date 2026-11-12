import { getZoneWallClock, type WallClock } from './internal/zoneWallClock.js';

type GetDateFromUnixFormat = 'ymd' | 'ymdhms' | 'ymdhm' | 'readable1';
type GetDateFromUnixTimezone = 'Etc/UTC' | 'America/New_York' | 'America/Chicago';

const getProcessWallClock = (unixTimestamp: number, startOrEndOfDay?: 'start' | 'end'): WallClock => {
    const datetime = new Date(unixTimestamp * 1000);

    if (startOrEndOfDay === 'start') {
        datetime.setHours(0, 0, 0, 0);
    } else if (startOrEndOfDay === 'end') {
        datetime.setHours(23, 59, 59, 999);
    }

    return {
        year: `${datetime.getFullYear()}`,
        month: `0${datetime.getMonth() + 1}`.slice(-2),
        day: `0${datetime.getDate()}`.slice(-2),
        hours: `0${datetime.getHours()}`.slice(-2),
        minutes: `0${datetime.getMinutes()}`.slice(-2),
        seconds: `0${datetime.getSeconds()}`.slice(-2),
        dateString: datetime.toDateString()
    };
};

/**
 * Formats a Unix-seconds instant as a wall-clock string in `timezone`, or in the process's local zone when no zone is
 * given. `startOrEndOfDay` replaces the time with 00:00:00 or 23:59:59 on that same calendar date.
 */
export const getDateFromUnix = (
    unixTimestamp: number,
    returnFormat: GetDateFromUnixFormat = 'ymd',
    timezone?: GetDateFromUnixTimezone,
    startOrEndOfDay?: 'start' | 'end'
): string => {
    let wallClock: WallClock;

    if (timezone) {
        wallClock = getZoneWallClock(unixTimestamp, timezone);

        if (startOrEndOfDay === 'start') {
            wallClock = { ...wallClock, hours: '00', minutes: '00', seconds: '00' };
        } else if (startOrEndOfDay === 'end') {
            wallClock = { ...wallClock, hours: '23', minutes: '59', seconds: '59' };
        }
    } else {
        wallClock = getProcessWallClock(unixTimestamp, startOrEndOfDay);
    }

    const { year, month, day, hours, minutes, seconds, dateString } = wallClock;

    switch (returnFormat) {
        case 'ymd':
            return `${year}-${month}-${day}`;
        case 'ymdhms':
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        case 'ymdhm':
            return `${year}-${month}-${day} ${hours}:${minutes}`;
        case 'readable1':
            return `${dateString} ${hours}:${minutes}`;
        default: {
            const unsupportedFormat: never = returnFormat;
            throw new Error(`getDateFromUnix: unsupported format ${String(unsupportedFormat)}`);
        }
    }
};
