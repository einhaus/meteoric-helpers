import { describe, expect, it } from 'vitest';
import { compileDatabaseQuery } from '../../src/mcp/database/query.js';
import { testConfig } from './fixtures.js';

const config = testConfig();
const compile = (sql: string) => compileDatabaseQuery(sql, config.profiles.catalog!.tables, config.limits);
describe('database MCP query policy', () => {
    it('binds literals and reconstructs joins and aggregates over approved columns', () => {
        const query = compile(
            "SELECT p.name, COUNT(*) AS total FROM titles t LEFT JOIN providers p ON t.provider_id = p.id WHERE t.type = 'movie' GROUP BY p.name HAVING COUNT(*) > 1 ORDER BY total DESC LIMIT 20"
        );
        expect(query.sql).toContain('LEFT JOIN `providers` AS `p` ON (`t`.`provider_id` = `p`.`id`)');
        expect(query.sql).toContain('WHERE (`t`.`type` = ?)');
        expect(query.sql).toContain('ORDER BY `total` DESC LIMIT 20 OFFSET 0');
        expect(query.parameters).toEqual(['movie', 1]);
    });
    it('caps rows and offsets and fingerprints omit literals', () => {
        expect(compile('SELECT id FROM titles').sql).toContain('LIMIT 201 OFFSET 0');
        expect(compile('SELECT id FROM titles LIMIT 9000 OFFSET 5').sql).toContain('LIMIT 201 OFFSET 5');
        expect(compile('SELECT id FROM titles LIMIT 3, 10').sql).toContain('LIMIT 10 OFFSET 3');
        expect(compile("SELECT title FROM titles WHERE title = 'secret-one'").fingerprint).toBe(
            compile("SELECT title FROM titles WHERE title = 'secret-two'").fingerprint
        );
        expect(() => compile('SELECT id FROM titles LIMIT 5 OFFSET 10001')).toThrow();
    });
    it('decodes SQL string escapes before binding and permits comment markers inside strings', () => {
        expect(compile(String.raw`SELECT id FROM titles WHERE title = 'Schindler\'s List'`).parameters).toEqual(["Schindler's List"]);
        expect(compile("SELECT id FROM titles WHERE title = 'Schindler''s List'").parameters).toEqual(["Schindler's List"]);
        expect(compile(String.raw`SELECT id FROM titles WHERE title = 'a\\b'`).parameters).toEqual(['a\\b']);
        expect(compile("SELECT id FROM titles WHERE title = '#Alive -- /* premiere */'").parameters).toEqual(['#Alive -- /* premiere */']);
        expect(compile(String.raw`SELECT id FROM titles WHERE title LIKE '100\%'`).parameters).toEqual(['100\\%']);
        expect(() => compile("SELECT id FROM titles WHERE title = 'x' /* comment */")).toThrow();
    });
    it('preserves parameter order across projection, join, filter and having', () => {
        const query = compile(
            "SELECT COALESCE(t.title, 'fallback') AS label, COUNT(*) AS n FROM titles t JOIN providers p ON p.id = 5 WHERE t.id BETWEEN 6 AND 7 GROUP BY t.title HAVING COUNT(*) > 8 ORDER BY label"
        );
        expect(query.parameters).toEqual(['fallback', 5, 6, 7, 8]);
        expect(query.sql.match(/\?/g)).toHaveLength(5);
    });
    it('rejects numeric literals that the parser cannot represent precisely', () => {
        expect(() => compile('SELECT id FROM titles WHERE id = 9007199254740993')).toThrow();
        expect(() => compile('SELECT id FROM titles WHERE id = 1.234567890123456789')).toThrow();
        expect(compile('SELECT id FROM titles WHERE id = 1.25').parameters).toEqual(['1.25']);
        expect(compile("SELECT id FROM titles WHERE id = '9007199254740993'").parameters).toEqual(['9007199254740993']);
    });
    it.each([
        "UPDATE titles SET title = 'x'",
        'DELETE FROM titles',
        'DROP TABLE titles',
        'SELECT id FROM titles; DELETE FROM titles',
        'SELECT * FROM titles',
        'SELECT t.* FROM titles t',
        'SELECT password AS title FROM titles',
        'SELECT HEX(password) FROM titles',
        "SELECT id FROM titles WHERE password = 'guess'",
        'SELECT id FROM titles ORDER BY password',
        'SELECT id FROM titles GROUP BY password',
        'SELECT COUNT(*) FROM titles HAVING MAX(password) > 0',
        'SELECT t.id FROM titles t JOIN providers p ON t.password = p.name',
        'SELECT id FROM users',
        'SELECT id FROM other.titles',
        'SELECT * FROM information_schema.TABLES',
        "SELECT LOAD_FILE('/etc/passwd') FROM titles",
        'SELECT SLEEP(10) FROM titles',
        'SELECT BENCHMARK(999999, 1) FROM titles',
        "SELECT GET_LOCK('lock',10) FROM titles",
        'SELECT dangerous_function(id) FROM titles',
        'SELECT app.ABS(id) FROM titles',
        "SELECT id INTO OUTFILE '/tmp/out' FROM titles",
        'SELECT id FROM titles FOR UPDATE',
        'SELECT id FROM titles LOCK IN SHARE MODE',
        'SELECT @@version FROM titles',
        'SELECT @x := id FROM titles',
        'SELECT id FROM titles UNION SELECT id FROM users',
        'SELECT (SELECT password FROM users) FROM titles',
        'WITH x AS (SELECT id FROM titles) SELECT id FROM x',
        'SELECT /*!50000 SLEEP(10), */ id FROM titles',
        'SELECT id FROM titles -- comment',
        'SELECT id FROM titles # comment',
        'SELECT SQL_CALC_FOUND_ROWS id FROM titles',
        'SELECT id FROM titles t JOIN providers p USING (id)',
        'SELECT t.id FROM titles t, providers p',
        'SELECT ROW_NUMBER() OVER () FROM titles',
        'SHOW GRANTS',
        'CALL write_something()',
        'SELECT id FROM titles LIMIT -1',
        'SELECT id FROM titles LIMIT 1; SELECT id FROM titles',
        'SELECT id FROM __proto__',
        'SELECT CONVERT(password USING utf8) FROM titles'
    ])('rejects unsupported or unauthorized SQL: %s', (sql) => {
        expect(() => compile(sql)).toThrow();
    });
    it('allows a small set of safe functions and distinct aggregates', () => {
        expect(compile('SELECT type, COUNT(DISTINCT id), ROUND(AVG(id), 2) FROM titles GROUP BY type').parameters).toEqual([2]);
        expect(compile('SELECT id FROM titles WHERE id IN (1, 2) AND title IS NOT NULL').parameters).toEqual([1, 2]);
    });
    it('rejects deeply nested or oversized requests', () => {
        expect(() => compile(`SELECT ${'ABS('.repeat(40)}id${')'.repeat(40)} FROM titles`)).toThrow();
        expect(() => compile(`SELECT '${'x'.repeat(17000)}' FROM titles`)).toThrow();
    });
});
