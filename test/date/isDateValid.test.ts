import { describe, expect, it } from 'vitest';
import { isDateValid } from '../../src/date/isDateValid.js';

describe('isDateValid', () => {
    it('strictly validates calendar dates', () => {
        expect(isDateValid('2028-02-29')).toBe(true);
        expect(isDateValid('2027-02-29')).toBe(false);
        expect(isDateValid('2012-61-12')).toBe(false);
        expect(isDateValid('2012-60-82')).toBe(false);
    });

    it('requires the supplied format exactly', () => {
        expect(isDateValid('07/12/2026', 'MM/DD/YYYY')).toBe(true);
        expect(isDateValid('2026-07-12', 'MM/DD/YYYY')).toBe(false);
        expect(isDateValid('2026-7-12')).toBe(false);
    });
});
