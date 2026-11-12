import { describe, expect, it } from 'vitest';
import { getDate } from '../../src/date/getDate.js';
import { getDateFromUtc } from '../../src/date/getDateFromUtc.js';

const PROCESS_ZONES = ['Etc/UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Australia/Sydney'];
const LONDON_GAP = 1774762200; // 2026-03-29T05:30:00Z = 01:30 Eastern (a missing London wall clock).
const SYDNEY_GAP = 1791095400; // 2026-10-04T06:30:00Z = 02:30 Eastern (a missing Sydney wall clock).

const inProcessZone = <T>(zone: string, run: () => T): T => {
    const previous = process.env.TZ;
    process.env.TZ = zone;
    try {
        return run();
    } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
    }
};

describe.each(PROCESS_ZONES)('explicit-zone date helpers in a %s process', (processZone) => {
    const date = (config: Parameters<typeof getDate>[0]) => inProcessZone(processZone, () => getDate(config));
    const fromUtc = (...args: Parameters<typeof getDateFromUtc>) => inProcessZone(processZone, () => getDateFromUtc(...args));

    it.each([
        [LONDON_GAP, '2026-03-29 01:30:00', '2026-03-29T05:30:00.000Z', '2026-03-29T01:30:00-04:00'],
        [SYDNEY_GAP, '2026-10-04 02:30:00', '2026-10-04T06:30:00.000Z', '2026-10-04T02:30:00-04:00']
    ] as const)('preserves the instant and wall clock across a host gap at %s', (timestamp, clock, iso, iso8601) => {
        expect(date({ date: timestamp, timezone: 'America/New_York', format: 'ymdhms' })).toBe(clock);
        expect(date({ date: timestamp, timezone: 'America/New_York', format: 'unix' })).toBe(String(timestamp));
        expect(date({ date: timestamp, timezone: 'America/New_York', format: 'iso' })).toBe(iso);
        expect(date({ date: timestamp, timezone: 'America/New_York', format: 'iso8601' })).toBe(iso8601);
        expect(fromUtc(timestamp * 1000, 'ymdhms', 'America/New_York')).toBe(clock);
        expect(fromUtc(timestamp * 1000, 'unix', 'America/New_York')).toBe(timestamp);
    });

    it.each([
        ['Etc/UTC', '2026-03-29 05:30:00'],
        ['America/New_York', '2026-03-29 01:30:00'],
        ['America/Chicago', '2026-03-29 00:30:00'],
        ['America/Denver', '2026-03-28 23:30:00'],
        ['America/Los_Angeles', '2026-03-28 22:30:00']
    ] as const)('supports the %s target and its calendar date', (zone, clock) => {
        expect(fromUtc(LONDON_GAP * 1000, 'ymdhms', zone)).toBe(clock);
        expect(fromUtc(LONDON_GAP * 1000, 'unix', zone)).toBe(LONDON_GAP);
        if (zone !== 'America/Denver' && zone !== 'America/Los_Angeles') {
            expect(date({ date: LONDON_GAP, timezone: zone, format: 'ymdhms' })).toBe(clock);
        }
    });

    it('preserves formats, milliseconds and numeric input units', () => {
        const instantMs = Date.parse('2026-03-29T05:30:04.809Z');
        const expected: Record<NonNullable<NonNullable<Parameters<typeof getDate>[0]>['format']>, string> = {
            ymd: '2026-03-29',
            ymdhms: '2026-03-29 01:30:04',
            ymdhmss: '2026-03-29 01:30:04.809',
            mdy: '03-29-2026',
            iso: '2026-03-29T05:30:04.809Z',
            iso8601: '2026-03-29T01:30:04-04:00',
            unix: String(Math.floor(instantMs / 1000)),
            // The existing explicit-date path does not implement yyyy; this timezone fix leaves that behavior alone.
            yyyy: '',
            readable1: 'Sun, Mar 29, 2026 1:30 AM',
            readable2: 'Mar 29, 2026 1:30 AM',
            weekdayMonthDay: 'Sunday Mar 29',
            weekdayMonthDayYear: 'Sunday Mar 29 2026',
            monthDayYear: 'March 29, 2026'
        };
        for (const format of Object.keys(expected) as (keyof typeof expected)[]) {
            for (const input of [instantMs / 1000, new Date(instantMs), '2026-03-29T07:30:04.809+02:00']) {
                expect(date({ date: input, timezone: 'America/New_York', format })).toBe(expected[format]);
            }
        }
        for (const input of [instantMs, new Date(instantMs), '2026-03-29T05:30:04.809', '2026-03-29T07:30:04.809+02:00']) {
            expect(fromUtc(input, 'ymdhms', 'America/New_York')).toBe('2026-03-29 01:30:04');
            expect(fromUtc(input, 'ymd', 'America/New_York')).toBe('2026-03-29');
            expect(fromUtc(input, 'ymdhm', 'America/New_York')).toBe('2026-03-29 01:30');
            expect(fromUtc(input, 'readable1', 'America/New_York')).toBe('Sun, Mar 29, 2026 1:30 AM');
            expect(fromUtc(input, 'unix', 'America/New_York')).toBe(Math.floor(instantMs / 1000));
        }
        expect(date({ date: instantMs / 1000, timezone: 'Etc/UTC', format: 'iso8601' })).toBe('2026-03-29T05:30:04Z');
    });

    it.each([
        ['2026-03-08T06:59:59Z', '2026-03-08 01:59:59', '-05:00'],
        ['2026-03-08T07:00:00Z', '2026-03-08 03:00:00', '-04:00'],
        ['2026-11-01T05:30:00Z', '2026-11-01 01:30:00', '-04:00'],
        ['2026-11-01T06:30:00Z', '2026-11-01 01:30:00', '-05:00']
    ])('preserves the target DST transition at %s', (iso, clock, offset) => {
        const timestamp = Date.parse(iso!) / 1000;
        expect(date({ date: timestamp, timezone: 'America/New_York', format: 'ymdhms' })).toBe(clock);
        expect(date({ date: timestamp, timezone: 'America/New_York', format: 'iso8601' })).toBe(clock!.replace(' ', 'T') + offset);
        expect(date({ date: timestamp, timezone: 'America/New_York', format: 'unix' })).toBe(String(timestamp));
        expect(fromUtc(timestamp * 1000, 'ymdhms', 'America/New_York')).toBe(clock);
        expect(fromUtc(timestamp * 1000, 'unix', 'America/New_York')).toBe(timestamp);
    });

    it.each([
        ['2026-03-08T12:00:00Z', 'day', '2026-03-08T05:00:00.000Z', '2026-03-09T03:59:59.999Z'],
        ['2026-03-08T12:00:00Z', 'week', '2026-03-08T05:00:00.000Z', '2026-03-15T03:59:59.999Z'],
        ['2026-03-08T12:00:00Z', 'month', '2026-03-01T05:00:00.000Z', '2026-04-01T03:59:59.999Z'],
        ['2026-11-01T12:00:00Z', 'day', '2026-11-01T04:00:00.000Z', '2026-11-02T04:59:59.999Z'],
        ['2026-11-01T12:00:00Z', 'week', '2026-11-01T04:00:00.000Z', '2026-11-08T04:59:59.999Z'],
        ['2026-11-01T12:00:00Z', 'month', '2026-11-01T04:00:00.000Z', '2026-12-01T04:59:59.999Z'],
        ['2026-07-15T12:00:00Z', 'year', '2026-01-01T05:00:00.000Z', '2027-01-01T04:59:59.999Z']
    ] as const)('resolves %s %s boundaries with their own offsets', (input, unit, start, end) => {
        for (const [key, expected] of [
            ['startOf', start],
            ['endOf', end]
        ] as const) {
            expect(date({ date: input, timezone: 'America/New_York', [key]: unit, format: 'iso' })).toBe(expected);
            expect(date({ date: input, timezone: 'America/New_York', [key]: unit, format: 'unix' })).toBe(
                String(Math.floor(Date.parse(expected) / 1000))
            );
            const iso8601 = date({ date: input, timezone: 'America/New_York', [key]: unit, format: 'iso8601' });
            expect(Date.parse(iso8601)).toBe(Math.floor(Date.parse(expected) / 1000) * 1000);
            expect(date({ date: input, timezone: 'America/New_York', [key]: unit, format: 'ymdhmss' }).slice(11)).toBe(
                key === 'startOf' ? '00:00:00.000' : '23:59:59.999'
            );
        }
    });

    it('resolves UTC/Chicago boundaries, and preserves start-before-end ordering', () => {
        expect(date({ date: LONDON_GAP, timezone: 'Etc/UTC', startOf: 'day', format: 'iso' })).toBe('2026-03-29T00:00:00.000Z');
        expect(date({ date: '2026-03-08T12:00:00Z', timezone: 'America/Chicago', startOf: 'day', format: 'iso' })).toBe(
            '2026-03-08T06:00:00.000Z'
        );
        expect(date({ date: '2026-03-08T12:00:00Z', timezone: 'America/Chicago', endOf: 'day', format: 'iso' })).toBe(
            '2026-03-09T04:59:59.999Z'
        );
        expect(date({ date: LONDON_GAP, timezone: 'America/New_York', startOf: 'year', endOf: 'month', format: 'iso' })).toBe(
            '2026-02-01T04:59:59.999Z'
        );
    });

    it('keeps UTC defaults, epoch zero, and invalid-date behavior', () => {
        expect(fromUtc(0, 'unix', 'America/New_York')).toBe(0);
        expect(date({ date: 0, timezone: 'America/New_York', format: 'unix' })).toBe('0');
        expect(fromUtc(LONDON_GAP * 1000, 'ymdhms')).toBe('2026-03-29 05:30:00');
        expect(fromUtc('invalid', 'ymd', 'America/New_York')).toBe('Invalid Date');
        expect(fromUtc('invalid', 'unix', 'America/New_York')).toBeNaN();
        expect(date({ date: 'invalid', timezone: 'America/New_York', format: 'ymd' })).toBe('Invalid Date');
        expect(date({ date: 'invalid', timezone: 'America/New_York', format: 'unix' })).toBe('NaN');
        expect(() => date({ date: 'invalid', timezone: 'America/New_York', format: 'iso' })).toThrow();
    });
});

describe('existing local parsing and arithmetic contracts', () => {
    it.each([
        ['Etc/UTC', '2026-03-29 05:30:00', '2026-03-29T01:30:00.000Z', '2026-03-08T17:00:00.000Z'],
        ['America/New_York', '2026-03-29 01:30:00', '2026-03-29T05:30:00.000Z', '2026-03-08T16:00:00.000Z'],
        ['Europe/London', '2026-03-29 06:30:00', '2026-03-29T01:30:00.000Z', '2026-03-08T17:00:00.000Z']
    ])('preserves local operations in %s', (zone, clock, parsed, incremented) => {
        inProcessZone(zone!, () => {
            expect(getDate({ date: LONDON_GAP, format: 'ymdhms' })).toBe(clock);
            expect(getDate({ date: '2026-03-29 01:30:00', timezone: 'America/New_York', format: 'iso' })).toBe(parsed);
            // Arithmetic still happens in the input/process zone before the requested display-zone conversion.
            expect(
                getDate({
                    date: '2026-03-07T17:00:00Z',
                    operator: '+',
                    interval: 1,
                    intervalType: 'day',
                    timezone: 'America/New_York',
                    format: 'iso'
                })
            ).toBe(incremented);
        });
    });
});
