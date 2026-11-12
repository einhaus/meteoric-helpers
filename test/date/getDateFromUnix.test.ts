import { describe, expect, it } from 'vitest';
import { getDateFromUnix } from '../../src/date/getDateFromUnix.js';

const REGULAR_SESSION = 1794407460; // 2026-11-11 09:31:00 EST = 14:31:00 UTC
const EVENING = 1794447000; // 2026-11-11 20:30:00 EST = 2026-11-12 01:30:00 UTC
const BEFORE_SPRING_FORWARD = 1772953199; // 2026-03-08 01:59:59 EST
const AFTER_SPRING_FORWARD = 1772953200; // one second later: 2026-03-08 03:00:00 EDT
const SPRING_FORWARD_NOON_UTC = 1772971200; // 2026-03-08 08:00:00 EDT
const FIRST_REPEATED_HOUR = 1793511000; // 2026-11-01 01:30:00 EDT
const SECOND_REPEATED_HOUR = 1793514600; // 2026-11-01 01:30:00 EST, one hour later
const INSIDE_LONDON_GAP = 1774762200; // 2026-03-29 01:30:00 EDT; 01:00-02:00 does not exist in London that day

// Europe/London is here because a converter that reparses through the process zone is an hour off inside its gap.
const PROCESS_ZONES = ['Etc/UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London'] as const;

const runInProcessTimeZone = <T>(timeZone: string, run: () => T): T => {
    const previousTimeZone = process.env.TZ;
    process.env.TZ = timeZone;

    try {
        return run();
    } finally {
        if (previousTimeZone === undefined) {
            delete process.env.TZ;
        } else {
            process.env.TZ = previousTimeZone;
        }
    }
};

describe.each(PROCESS_ZONES)('getDateFromUnix with an explicit zone in a %s process', (processZone) => {
    const format = (...args: Parameters<typeof getDateFromUnix>) => runInProcessTimeZone(processZone, () => getDateFromUnix(...args));

    it('formats the wall clock of the requested zone', () => {
        expect(format(REGULAR_SESSION, 'ymdhms', 'America/New_York')).toBe('2026-11-11 09:31:00');
        expect(format(REGULAR_SESSION, 'ymdhms', 'America/Chicago')).toBe('2026-11-11 08:31:00');
        expect(format(REGULAR_SESSION, 'ymdhms', 'Etc/UTC')).toBe('2026-11-11 14:31:00');
        expect(format(REGULAR_SESSION, 'ymdhm', 'America/New_York')).toBe('2026-11-11 09:31');
        expect(format(REGULAR_SESSION, 'readable1', 'America/New_York')).toBe('Wed Nov 11 2026 09:31');
    });

    it('keeps the calendar date of the requested zone when UTC has already rolled over', () => {
        expect(format(EVENING, 'ymd', 'America/New_York')).toBe('2026-11-11');
        expect(format(EVENING, 'ymd', 'Etc/UTC')).toBe('2026-11-12');
        expect(format(EVENING, 'readable1', 'America/New_York')).toBe('Wed Nov 11 2026 20:30');
        expect(format(EVENING, 'readable1', 'Etc/UTC')).toBe('Thu Nov 12 2026 01:30');
    });

    it('skips the missing hour at the spring-forward boundary', () => {
        expect(format(BEFORE_SPRING_FORWARD, 'ymdhms', 'America/New_York')).toBe('2026-03-08 01:59:59');
        expect(format(AFTER_SPRING_FORWARD, 'ymdhms', 'America/New_York')).toBe('2026-03-08 03:00:00');
        expect(format(AFTER_SPRING_FORWARD, 'ymdhms', 'America/Chicago')).toBe('2026-03-08 01:00:00');
    });

    it('repeats the wall clock across the fall-back hour', () => {
        expect(format(FIRST_REPEATED_HOUR, 'ymdhms', 'America/New_York')).toBe('2026-11-01 01:30:00');
        expect(format(SECOND_REPEATED_HOUR, 'ymdhms', 'America/New_York')).toBe('2026-11-01 01:30:00');
        expect(format(SECOND_REPEATED_HOUR, 'ymdhms', 'Etc/UTC')).toBe('2026-11-01 06:30:00');
    });

    it('formats requested-zone times that do not exist in the process zone', () => {
        expect(format(INSIDE_LONDON_GAP, 'ymdhms', 'America/New_York')).toBe('2026-03-29 01:30:00');
    });

    it('starts and ends the calendar day of the requested zone', () => {
        expect(format(SPRING_FORWARD_NOON_UTC, 'ymdhms', 'America/New_York', 'start')).toBe('2026-03-08 00:00:00');
        expect(format(SPRING_FORWARD_NOON_UTC, 'ymdhms', 'America/New_York', 'end')).toBe('2026-03-08 23:59:59');
        expect(format(EVENING, 'ymdhms', 'America/New_York', 'start')).toBe('2026-11-11 00:00:00');
        expect(format(EVENING, 'ymdhms', 'Etc/UTC', 'start')).toBe('2026-11-12 00:00:00');
        expect(format(EVENING, 'ymdhm', 'America/Chicago', 'end')).toBe('2026-11-11 23:59');
        expect(format(EVENING, 'readable1', 'America/New_York', 'end')).toBe('Wed Nov 11 2026 23:59');
        expect(format(EVENING, 'ymd', 'Etc/UTC', 'end')).toBe('2026-11-12');
    });

    it('rejects a timestamp that is not a finite number', () => {
        expect(() => format(Number.NaN, 'ymd', 'America/New_York')).toThrow('invalid Unix timestamp NaN');
    });
});

describe('getDateFromUnix without a zone', () => {
    // Unchanged contract: the process's local wall clock.
    it.each([
        ['Etc/UTC', '2026-11-12 01:30:00', 'Thu Nov 12 2026 01:30', '2026-11-12 00:00:00', '2026-11-12 23:59:59'],
        ['America/New_York', '2026-11-11 20:30:00', 'Wed Nov 11 2026 20:30', '2026-11-11 00:00:00', '2026-11-11 23:59:59'],
        ['America/Los_Angeles', '2026-11-11 17:30:00', 'Wed Nov 11 2026 17:30', '2026-11-11 00:00:00', '2026-11-11 23:59:59']
    ])('formats the %s process wall clock', (processZone, ymdhms, readable1, startOfDay, endOfDay) => {
        runInProcessTimeZone(processZone, () => {
            expect(getDateFromUnix(EVENING, 'ymdhms')).toBe(ymdhms);
            expect(getDateFromUnix(EVENING, 'ymdhm')).toBe(ymdhms.slice(0, 16));
            expect(getDateFromUnix(EVENING)).toBe(ymdhms.slice(0, 10));
            expect(getDateFromUnix(EVENING, 'readable1')).toBe(readable1);
            expect(getDateFromUnix(EVENING, 'ymdhms', undefined, 'start')).toBe(startOfDay);
            expect(getDateFromUnix(EVENING, 'ymdhms', undefined, 'end')).toBe(endOfDay);
        });
    });

    it('matches the explicit zone when the process runs in that zone', () => {
        for (const timestamp of [REGULAR_SESSION, EVENING, AFTER_SPRING_FORWARD, FIRST_REPEATED_HOUR, SECOND_REPEATED_HOUR]) {
            runInProcessTimeZone('America/New_York', () => {
                expect(getDateFromUnix(timestamp, 'ymdhms', 'America/New_York')).toBe(getDateFromUnix(timestamp, 'ymdhms'));
                expect(getDateFromUnix(timestamp, 'readable1', 'America/New_York', 'end')).toBe(
                    getDateFromUnix(timestamp, 'readable1', undefined, 'end')
                );
            });
        }
    });
});
