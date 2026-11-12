type GetDateFromUnixFormat = 'ymd' | 'ymdhms' | 'ymdhm' | 'readable1';
type GetDateFromUnixTimezone = 'Etc/UTC' | 'America/New_York' | 'America/Chicago';

interface WallClock {
    year: string;
    month: string;
    day: string;
    hours: string;
    minutes: string;
    seconds: string;
    /** The `Date#toDateString` form, such as `Wed Nov 11 2026`. */
    dateString: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

// Built once per zone: constructing an Intl formatter costs far more than formatting with one.
const zoneFormatters = new Map<GetDateFromUnixTimezone, Intl.DateTimeFormat>();

const getZoneFormatter = (timezone: GetDateFromUnixTimezone): Intl.DateTimeFormat => {
    let formatter = zoneFormatters.get(timezone);

    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            weekday: 'short',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23'
        });
        zoneFormatters.set(timezone, formatter);
    }

    return formatter;
};

/**
 * Wall-clock fields in an explicit zone. Intl reads the zone database directly, so the result does not depend on the
 * process zone; dayjs `.tz()` does, and is an hour off for target times inside the process zone's spring-forward gap.
 */
const getZoneWallClock = (unixTimestamp: number, timezone: GetDateFromUnixTimezone): WallClock => {
    if (!Number.isFinite(unixTimestamp)) {
        throw new Error(`getDateFromUnix: invalid Unix timestamp ${unixTimestamp} for time zone ${timezone}`);
    }

    const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};

    for (const part of getZoneFormatter(timezone).formatToParts(unixTimestamp * 1000)) {
        parts[part.type] = part.value;
    }

    const { weekday, year, month, day, hour, minute, second } = parts;

    if (!weekday || !year || !month || !day || !hour || !minute || !second) {
        throw new Error(`getDateFromUnix: incomplete ${timezone} date parts for Unix timestamp ${unixTimestamp}`);
    }

    return {
        year,
        month,
        day,
        hours: hour,
        minutes: minute,
        seconds: second,
        dateString: `${weekday} ${MONTH_NAMES[Number(month) - 1]} ${day} ${year}`
    };
};

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
