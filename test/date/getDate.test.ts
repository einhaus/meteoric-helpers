import { describe, expect, it } from 'bun:test';

describe('getDate timezone helpers', () => {
    it('formats UTC ISO timestamps in a fresh module graph', async () => {
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
});
