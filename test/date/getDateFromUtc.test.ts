import { describe, expect, it } from 'bun:test';

describe('getDateFromUtc timezone helpers', () => {
    it('converts UTC datetimes to Eastern time in a fresh module graph', async () => {
        const { getDateFromUtc } = await import('../../src/date/getDateFromUtc.js');

        expect(getDateFromUtc('2026-04-08T14:05:04Z', 'ymdhms', 'America/New_York')).toBe('2026-04-08 10:05:04');
    });
});
