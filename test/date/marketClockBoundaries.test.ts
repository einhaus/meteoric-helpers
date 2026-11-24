import { describe, expect, test } from 'bun:test';
import { getDate } from '../../src/date/getDate.js';
import { getDiffBetweenDates } from '../../src/date/getDiffBetweenDates.js';
import { getDateString } from '../../src/date/getDateString.js';
import { getDateNumericalTime } from '../../src/date/getDateNumericalTime.js';
import { getOpenOrCloseUnix } from '../../src/date/getOpenOrCloseUnix.js';
import { getFridayMarketCloseUnix } from '../../src/date/getFridayMarketCloseUnix.js';
import { getMarketCloseUnix } from '../../src/date/getMarketCloseUnix.js';
import { getStartOrEndUnix } from '../../src/date/getStartOrEndUnix.js';
import { isDateWithinTradingHours } from '../../src/date/isDateWithinTradingHours.js';

const epoch = (iso: string) => Date.parse(iso) / 1000;
const ny = 'America/New_York';

describe('exchange clocks', () => {
    test.each([
        ['2026-11-17', '-05:00', '2026-11-20'],
        ['2026-07-07', '-04:00', '2026-07-10']
    ])('keeps ordinary session boundaries in exchange time for %s', (date, offset, friday) => {
        const noon = epoch(date + 'T12:00:37' + offset);
        expect(getDateNumericalTime(noon, ny)).toBe(1200);
        const open = epoch(date + 'T09:30:00' + offset);
        const close = epoch(date + 'T16:00:00' + offset);
        expect([open - 1, open, noon, close - 1, close].map(isDateWithinTradingHours)).toEqual([false, true, true, true, false]);
        expect(getOpenOrCloseUnix(noon, 'open')).toBe(open);
        expect(getMarketCloseUnix(noon)).toBe(close);
        expect(getFridayMarketCloseUnix(noon)).toBe(epoch(friday + 'T16:00:00' + offset));
    });
    test.each([
        ['2026-03-08T12:00:00-04:00', '2026-03-08T00:00:00-05:00', '2026-03-08T23:59:59-04:00'],
        ['2026-11-01T12:00:00-05:00', '2026-11-01T00:00:00-04:00', '2026-11-01T23:59:59-05:00']
    ])('uses both actual midnights on %s', (instant, start, end) => {
        expect(getStartOrEndUnix(epoch(instant), 'start', 'day', ny)).toBe(epoch(start));
        expect(getStartOrEndUnix(epoch(instant), 'end', 'day', ny)).toBe(epoch(end));
    });
    test('formats a declared Eastern input in UTC, including a date-only input and fractional seconds', () => {
        expect(getDate({ date: '2026-11-24 23:59:59.03', inputTimezone: ny, timezone: 'Etc/UTC', format: 'iso' })).toBe(
            '2026-11-25T04:59:59.030Z'
        );
        expect(getDate({ date: '2026-07-01', inputTimezone: ny, format: 'iso' })).toBe('2026-07-01T04:00:00.000Z');
        expect(getDateNumericalTime('2026-07-01T13:31:00Z', ny)).toBe(931);
        expect(getDateNumericalTime('2026-07-01 09:31:00', ny)).toBe(931);
    });
    test('distinguishes one New York calendar day from 24 hours when the clocks advance', () => {
        const input = { date: '2026-03-07 12:00:00', inputTimezone: ny, timezone: ny, operator: '+', format: 'iso' } as const;
        expect(getDate({ ...input, interval: 1, intervalType: 'day' })).toBe('2026-03-08T16:00:00.000Z');
        expect(getDate({ ...input, interval: 24, intervalType: 'hour' })).toBe('2026-03-08T17:00:00.000Z');
    });
    test.each(['2026-11-01 01:30:00', '2026-03-08 02:30:00', '2026-02-31', '2026-11-24T16:00:00Z'])(
        'rejects non-unique or invalid explicit input %s',
        (date) => {
            expect(() => getDate({ date, inputTimezone: ny, format: 'iso' })).toThrow();
        }
    );
});

test.each([
    ['2026-03-07T17:00:00Z', '2026-03-08T16:00:00.000Z'],
    ['2026-10-31T16:00:00Z', '2026-11-01T17:00:00.000Z']
])('adds a calendar day to an instant on the requested clock from %s', (date, nextNoon) => {
    expect(getDate({ date, timezone: ny, operator: '+', interval: 1, intervalType: 'day', format: 'iso' })).toBe(nextNoon);
});
test('uses the requested zone for a calendar year and preserves the instant during a host spring gap', () => {
    expect(getDate({ date: '2026-01-01T02:00:00Z', timezone: ny, format: 'yyyy' })).toBe('2025');
    expect(getDateString('iso', null, 'Etc/UTC', epoch('2026-03-08T02:30:45Z'))).toBe('2026-03-08T02:30:45.000Z');
});

test('distinguishes civil calendar days and elapsed hours in a declared zone', () => {
    expect(getDiffBetweenDates('2026-03-08 12:00:00', '2026-03-07 12:00:00', 'day', ny)).toBe(1);
    expect(getDiffBetweenDates('2026-03-08 12:00:00', '2026-03-07 12:00:00', 'hour', ny)).toBe(23);
    expect(getDiffBetweenDates('2026-11-01T01:30:00-05:00', '2026-11-01T01:30:00-04:00', 'hour', ny)).toBe(1);
});
