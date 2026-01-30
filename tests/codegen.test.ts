import { describe, it, expect } from 'vitest';
import { compile, parse, toSql } from '../src/index.js';

describe('SQL Generator', () => {
  const options = { year: 2024 };

  describe('basic queries', () => {
    it('generates SQL for minimal query', () => {
      const sql = compile('HAS fiber COUNT homes', options);

      expect(sql).toContain("tek = 'fiber'");
      expect(sql).toContain('SUM(hus)');
      expect(sql).toContain("'data/2024/adr.parquet'");
      expect(sql).toContain("'data/2024/fbb.parquet'");
    });

    it('generates SQL with county grouping', () => {
      const sql = compile('HAS fiber COUNT homes BY county', options);

      expect(sql).toContain('fylke AS gruppe');
      expect(sql).toContain('GROUP BY fylke');
    });

    it('generates SQL with municipality grouping', () => {
      const sql = compile('HAS fiber COUNT homes BY municipality', options);

      expect(sql).toContain('komnavn AS gruppe');
    });

    it('generates SQL with urban grouping', () => {
      const sql = compile('HAS fiber COUNT homes BY urban', options);

      expect(sql).toContain("CASE WHEN ertett THEN 'Tettsted' ELSE 'Spredt' END AS gruppe");
    });
  });

  describe('speed conversion', () => {
    it('converts speed from Mbps to kbps', () => {
      const sql = compile('HAS speed >= 100 COUNT homes', options);

      // 100 Mbps = 100000 kbps
      expect(sql).toContain('ned >= 100000');
    });

    it('converts upload speed from Mbps to kbps', () => {
      const sql = compile('HAS upload >= 50 COUNT homes', options);

      // 50 Mbps = 50000 kbps
      expect(sql).toContain('opp >= 50000');
    });
  });

  describe('technology mappings', () => {
    it('maps fiber to tek column', () => {
      const sql = compile('HAS fiber COUNT homes', options);
      expect(sql).toContain("tek = 'fiber'");
    });

    it('maps cable to tek column', () => {
      const sql = compile('HAS cable COUNT homes', options);
      expect(sql).toContain("tek = 'cable'");
    });

    it('maps 5g to tek column', () => {
      const sql = compile('HAS 5g COUNT homes', options);
      expect(sql).toContain("tek = '5g'");
    });

    it('maps fwa to tek column', () => {
      const sql = compile('HAS fwa COUNT homes', options);
      expect(sql).toContain("tek = 'fwa'");
    });
  });

  describe('metric mappings', () => {
    it('maps homes to hus', () => {
      const sql = compile('HAS fiber COUNT homes', options);
      expect(sql).toContain('SUM(hus)');
    });

    it('maps cabins to fritid', () => {
      const sql = compile('HAS fiber COUNT cabins', options);
      expect(sql).toContain('SUM(fritid)');
    });
  });

  describe('population filters', () => {
    it('generates urban filter', () => {
      const sql = compile('HAS fiber IN urban COUNT homes', options);
      expect(sql).toContain('ertett = true');
    });

    it('generates rural filter', () => {
      const sql = compile('HAS fiber IN rural COUNT homes', options);
      expect(sql).toContain('ertett = false');
    });

    it('generates county filter', () => {
      const sql = compile('HAS fiber IN county = "Oslo" COUNT homes', options);
      expect(sql).toContain("fylke = 'Oslo'");
    });
  });

  describe('boolean expressions', () => {
    it('generates AND expression', () => {
      const sql = compile('HAS fiber AND speed >= 100 COUNT homes', options);

      expect(sql).toContain("tek = 'fiber'");
      expect(sql).toContain('ned >= 100000');
      expect(sql).toContain('AND');
    });

    it('generates OR expression', () => {
      const sql = compile('HAS fiber OR cable COUNT homes', options);

      expect(sql).toContain("tek = 'fiber'");
      expect(sql).toContain("tek = 'cable'");
      expect(sql).toContain('OR');
    });

    it('generates NOT expression', () => {
      const sql = compile('HAS NOT dsl COUNT homes', options);
      expect(sql).toContain("NOT (tek = 'dsl')");
    });

    it('generates nested expression', () => {
      const sql = compile('HAS (fiber OR cable) AND speed >= 100 COUNT homes', options);

      expect(sql).toContain("(tek = 'fiber' OR tek = 'cable')");
      expect(sql).toContain('AND');
      expect(sql).toContain('ned >= 100000');
    });
  });

  describe('quantifiers', () => {
    it('generates ANY as OR', () => {
      const sql = compile('HAS ANY(fiber, cable) COUNT homes', options);

      expect(sql).toContain("tek = 'fiber' OR tek = 'cable'");
    });

    it('generates ALL as INTERSECT', () => {
      const sql = compile('HAS ALL(fiber, 5g) COUNT homes', options);

      expect(sql).toContain('INTERSECT');
      expect(sql).toContain("tek = 'fiber'");
      expect(sql).toContain("tek = '5g'");
    });

    it('generates NONE as NOT IN', () => {
      const sql = compile('HAS NONE(speed >= 30) COUNT homes', options);

      expect(sql).toContain('NOT IN');
      expect(sql).toContain('ned >= 30000');
    });
  });

  describe('output options', () => {
    it('generates count columns for SHOW count', () => {
      const sql = compile('HAS fiber COUNT homes SHOW count', options);

      expect(sql).toContain('covered');
      expect(sql).toContain('total');
      expect(sql).not.toContain('percent');
    });

    it('generates percent column for SHOW percent', () => {
      const sql = compile('HAS fiber COUNT homes SHOW percent', options);

      expect(sql).toContain('percent');
      expect(sql).toContain('ROUND(100.0');
    });

    it('generates all columns for SHOW both', () => {
      const sql = compile('HAS fiber COUNT homes SHOW both', options);

      expect(sql).toContain('covered');
      expect(sql).toContain('total');
      expect(sql).toContain('percent');
    });
  });

  describe('sorting', () => {
    it('generates ORDER BY gruppe ASC by default', () => {
      const sql = compile('HAS fiber COUNT homes', options);
      expect(sql).toContain('ORDER BY gruppe ASC');
    });

    it('generates ORDER BY percent DESC', () => {
      const sql = compile('HAS fiber COUNT homes SORT percent DESC', options);
      expect(sql).toContain('ORDER BY percent DESC');
    });

    it('generates ORDER BY covered', () => {
      const sql = compile('HAS fiber COUNT homes SORT count ASC', options);
      expect(sql).toContain('ORDER BY covered ASC');
    });
  });

  describe('LIMIT', () => {
    it('generates LIMIT clause', () => {
      const sql = compile('HAS fiber COUNT homes TOP 10', options);
      expect(sql).toContain('LIMIT 10');
    });

    it('omits LIMIT when no TOP', () => {
      const sql = compile('HAS fiber COUNT homes', options);
      expect(sql).not.toMatch(/LIMIT \d+/);
    });
  });

  describe('custom data path', () => {
    it('uses custom data path', () => {
      const sql = compile('HAS fiber COUNT homes', { year: 2024, dataPath: '/custom/path' });

      expect(sql).toContain("'/custom/path/2024/adr.parquet'");
      expect(sql).toContain("'/custom/path/2024/fbb.parquet'");
    });
  });

  describe('full integration', () => {
    it('generates complete SQL for complex query', () => {
      const sql = compile(
        'HAS fiber AND speed >= 100 IN urban COUNT homes BY county SHOW both SORT percent DESC TOP 5',
        options
      );

      // Verify all parts are present
      expect(sql).toContain('WITH population AS');
      expect(sql).toContain('coverage AS');
      expect(sql).toContain("tek = 'fiber'");
      expect(sql).toContain('ned >= 100000');
      expect(sql).toContain('ertett = true');
      expect(sql).toContain('SUM(hus)');
      expect(sql).toContain('fylke AS gruppe');
      expect(sql).toContain('ORDER BY percent DESC');
      expect(sql).toContain('LIMIT 5');
    });
  });

  describe('FOR clause', () => {
    it('uses FOR year instead of options.year', () => {
      const sql = compile('HAS fiber COUNT homes FOR 2023', { year: 2024 });

      expect(sql).toContain("'data/2023/adr.parquet'");
      expect(sql).toContain("'data/2023/fbb.parquet'");
      expect(sql).not.toContain("'data/2024/");
    });

    it('generates single year SQL for FOR with one year', () => {
      const sql = compile('HAS fiber COUNT homes FOR 2024', {});

      expect(sql).toContain("'data/2024/adr.parquet'");
      expect(sql).toContain("'data/2024/fbb.parquet'");
      expect(sql).not.toContain('UNION ALL');
    });

    it('generates multi-year SQL with UNION ALL', () => {
      const sql = compile('HAS fiber COUNT homes FOR (2023, 2024)', {});

      expect(sql).toContain('adr_union AS');
      expect(sql).toContain('fbb_union AS');
      expect(sql).toContain('UNION ALL');
      expect(sql).toContain("'data/2023/adr.parquet'");
      expect(sql).toContain("'data/2024/adr.parquet'");
      expect(sql).toContain("'data/2023/fbb.parquet'");
      expect(sql).toContain("'data/2024/fbb.parquet'");
    });

    it('includes aar column in multi-year SQL', () => {
      const sql = compile('HAS fiber COUNT homes BY county FOR (2023, 2024)', {});

      expect(sql).toContain('2023 AS aar');
      expect(sql).toContain('2024 AS aar');
      expect(sql).toContain('p.aar');
    });

    it('falls back to options.year when no FOR clause', () => {
      const sql = compile('HAS fiber COUNT homes', { year: 2024 });

      expect(sql).toContain("'data/2024/adr.parquet'");
    });
  });
});
