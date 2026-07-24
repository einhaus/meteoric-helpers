import { describe, expect, it } from 'vitest';

import {
    parseJsonColumn,
    parseJsonNumberArrayColumn,
    parseJsonObjectColumn,
    parseJsonStringArrayColumn
} from '../../src/db/parseJsonColumn.js';

describe('parseJsonColumn', () => {
    it('parses raw JSON strings', () => {
        expect(parseJsonColumn<string[]>('["US","CA"]', 'test regions')).toEqual(['US', 'CA']);
        expect(parseJsonColumn<{ a: number }>('{"a":1}', 'test object')).toEqual({ a: 1 });
    });

    it('passes through driver-decoded values unchanged', () => {
        const decodedArray = ['US', 'CA'];
        const decodedObject = { a: 1 };

        expect(parseJsonColumn<string[]>(decodedArray, 'test regions')).toBe(decodedArray);
        expect(parseJsonColumn<{ a: number }>(decodedObject, 'test object')).toBe(decodedObject);
    });

    it('returns null for null, undefined, and empty string', () => {
        expect(parseJsonColumn<string[]>(null, 'test')).toBeNull();
        expect(parseJsonColumn<string[]>(undefined, 'test')).toBeNull();
        expect(parseJsonColumn<string[]>('', 'test')).toBeNull();
        expect(parseJsonColumn<string[]>('null', 'test')).toBeNull();
    });

    it('does not treat decoded falsy JSON scalars as null', () => {
        expect(parseJsonColumn<number>(0, 'test zero')).toBe(0);
        expect(parseJsonColumn<boolean>(false, 'test false')).toBe(false);
        expect(parseJsonColumn<number>('0', 'test zero string')).toBe(0);
        expect(parseJsonColumn<boolean>('false', 'test false string')).toBe(false);
    });

    it('throws with context for invalid JSON strings', () => {
        expect(() => parseJsonColumn<string[]>('US,CA', 'provider 42 regions')).toThrowError(/provider 42 regions contains invalid JSON/);
        expect(() => parseJsonColumn<string[]>('[object Object]', 'user 7 loginTokens')).toThrowError(
            /user 7 loginTokens contains invalid JSON/
        );
    });
});

describe('parseJsonStringArrayColumn', () => {
    it('accepts raw JSON strings and decoded arrays', () => {
        expect(parseJsonStringArrayColumn('["a","b"]', 'test')).toEqual(['a', 'b']);
        expect(parseJsonStringArrayColumn(['a', 'b'], 'test')).toEqual(['a', 'b']);
        expect(parseJsonStringArrayColumn(null, 'test')).toBeNull();
    });

    it('rejects wrong shapes from both sources', () => {
        expect(() => parseJsonStringArrayColumn('{"a":1}' as never, 'question 9 titles')).toThrowError(
            /question 9 titles must be a JSON array of strings/
        );
        expect(() => parseJsonStringArrayColumn([1, 2] as never, 'question 9 titles')).toThrowError(
            /question 9 titles must be a JSON array of strings/
        );
    });
});

describe('parseJsonNumberArrayColumn', () => {
    it('accepts raw JSON strings and decoded arrays', () => {
        expect(parseJsonNumberArrayColumn('[157,203]', 'test providers')).toEqual([157, 203]);
        expect(parseJsonNumberArrayColumn([157, 203], 'test providers')).toEqual([157, 203]);
        expect(parseJsonNumberArrayColumn(null, 'test providers')).toBeNull();
    });

    it('rejects wrong shapes from both sources', () => {
        expect(() => parseJsonNumberArrayColumn('["157"]' as never, 'release 5 providers')).toThrowError(
            /release 5 providers must be a JSON array of numbers/
        );
        expect(() => parseJsonNumberArrayColumn(['157'] as never, 'release 5 providers')).toThrowError(
            /release 5 providers must be a JSON array of numbers/
        );
    });
});

describe('parseJsonObjectColumn', () => {
    it('accepts raw JSON strings and decoded objects', () => {
        expect(parseJsonObjectColumn('{"tmdb_file":"x.jpg"}', 'test photos')).toEqual({ tmdb_file: 'x.jpg' });
        expect(parseJsonObjectColumn({ tmdb_file: 'x.jpg' }, 'test photos')).toEqual({ tmdb_file: 'x.jpg' });
        expect(parseJsonObjectColumn(null, 'test photos')).toBeNull();
    });

    it('rejects arrays and scalars from both sources', () => {
        expect(() => parseJsonObjectColumn('["a"]' as never, 'person 3 photos')).toThrowError(/person 3 photos must be a JSON object/);
        expect(() => parseJsonObjectColumn('5' as never, 'person 3 photos')).toThrowError(/person 3 photos must be a JSON object/);
    });
});
