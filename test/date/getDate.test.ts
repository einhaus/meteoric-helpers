import { describe, expect, it, vi } from 'vitest';

describe('getDate timezone helpers', () => {
    it('formats UTC ISO timestamps in a fresh module graph', async () => {
        vi.resetModules();

        const { getDate } = await import('../../src/date/getDate.js');
        const unixTimestampSeconds = Date.UTC(2026, 3, 8, 14, 5, 4, 809) / 1000;

        expect(
            getDate({
                date: unixTimestampSeconds,
                format: 'iso',
                timezone: 'Etc/UTC'
            })
        ).toBe('2026-04-08T14:05:04.809Z');
    });

    it('converts UTC datetimes to Eastern time in a fresh module graph', async () => {
        vi.resetModules();

        const { getDateFromUtc } = await import('../../src/date/getDateFromUtc.js');

        expect(getDateFromUtc('2026-04-08T14:05:04Z', 'ymdhms', 'America/New_York')).toBe('2026-04-08 10:05:04');
    });
});
