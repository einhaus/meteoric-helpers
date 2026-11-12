export type DateTimezone = 'Etc/UTC' | 'America/New_York' | 'America/Chicago' | 'America/Denver' | 'America/Los_Angeles';

export interface WallClock {
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
const zoneFormatters = new Map<DateTimezone, Intl.DateTimeFormat>();

const getZoneFormatter = (timezone: DateTimezone): Intl.DateTimeFormat => {
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

/** Read explicit-zone fields without parsing a target wall clock in the process zone. */
export const getZoneWallClock = (unixTimestamp: number, timezone: DateTimezone): WallClock => {
    if (!Number.isFinite(unixTimestamp)) {
        throw new Error(`date: invalid Unix timestamp ${unixTimestamp} for time zone ${timezone}`);
    }

    const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};

    for (const part of getZoneFormatter(timezone).formatToParts(unixTimestamp * 1000)) {
        parts[part.type] = part.value;
    }

    const { weekday, year, month, day, hour, minute, second } = parts;

    if (!weekday || !year || !month || !day || !hour || !minute || !second) {
        throw new Error(`date: incomplete ${timezone} date parts for Unix timestamp ${unixTimestamp}`);
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

/** A UTC calendar surrogate for formatting/boundary arithmetic; this is not the original instant. */
export const getZoneCalendarMs = (instantMs: number, timezone: DateTimezone): number => {
    const { year, month, day, hours, minutes, seconds } = getZoneWallClock(instantMs / 1000, timezone);
    const calendar = new Date(instantMs);
    calendar.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
    calendar.setUTCHours(Number(hours), Number(minutes), Number(seconds));
    return calendar.getTime();
};

/** Resolve a calendar boundary with its own offset, which may differ from the source instant across DST. */
export const resolveZoneCalendarMs = (calendarMs: number, timezone: DateTimezone, referenceMs: number): number => {
    const offsetAt = (instantMs: number) => getZoneCalendarMs(instantMs, timezone) - instantMs;
    const referenceOffset = offsetAt(referenceMs);
    let candidate = calendarMs - referenceOffset;
    const candidateOffset = offsetAt(candidate);

    if (candidateOffset === referenceOffset) return candidate;

    candidate -= candidateOffset - referenceOffset;
    const correctedOffset = offsetAt(candidate);

    if (correctedOffset === candidateOffset) return candidate;

    // A boundary in a skipped clock interval moves forward over the gap. For a repeated interval, the first matching
    // offset above preserves the source offset. Neither choice depends on the host zone or the current date.
    return calendarMs - Math.min(candidateOffset, correctedOffset);
};

export const formatZoneOffset = (offsetMs: number): string => {
    if (offsetMs === 0) return 'Z';
    const minutes = Math.abs(offsetMs / 60000);
    const hoursPart = String(Math.floor(minutes / 60)).padStart(2, '0');
    const minutesPart = String(minutes % 60).padStart(2, '0');
    return `${offsetMs < 0 ? '-' : '+'}${hoursPart}:${minutesPart}`;
};
