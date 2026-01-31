import { describe, it, expect } from 'vitest';
import { compile, parse, toSql } from '../src/index.js';

describe('SQL Generator', () => {
  const options = { year: 2024 };

  describe('basic queries', () => {
    it('generates SQL for minimal query', () => {
      const sql = compile('HAS fiber COUNT hus', options);

      expect(sql).toContain("tek = 'fiber'");
      expect(sql).toContain('SUM(hus)');
      expect(sql).toContain("'data/span_adr.parquet'");
      expect(sql).toContain("'data/span_dekning.parquet'");
      expect(sql).toContain('aar = 2024');
    });

    it('generates SQL with fylke grouping', () => {
      const sql = compile('HAS fiber COUNT hus BY fylke', options);

      expect(sql).toContain('fylke AS gruppe');
      expect(sql).toContain('GROUP BY fylke');
    });

    it('includes national total for BY fylke', () => {
      const sql = compile('HAS fiber COUNT hus BY fylke', options);

      // Should use UNION ALL to add national total
      expect(sql).toContain('UNION ALL');
      expect(sql).toContain("'Norge' AS gruppe");
      // Should sort Norge last
      expect(sql).toContain("CASE WHEN gruppe = 'Norge' THEN 1 ELSE 0 END");
    });

    it('calculates national total correctly for SHOW begge', () => {
      const sql = compile('HAS fiber COUNT hus BY fylke SHOW begge', options);

      // Should aggregate from by_county CTE
      expect(sql).toContain('SUM(covered) AS covered');
      expect(sql).toContain('SUM(total) AS total');
      expect(sql).toContain('ROUND(100.0 * SUM(covered) / SUM(total), 1) AS percent');
    });

    it('does not add national total for other groupings', () => {
      const sql = compile('HAS fiber COUNT hus BY kom', options);

      expect(sql).not.toContain('UNION ALL');
      expect(sql).not.toContain("'Norge' AS gruppe");
    });

    it('generates SQL with kom grouping', () => {
      const sql = compile('HAS fiber COUNT hus BY kom', options);

      expect(sql).toContain('komnavn AS gruppe');
    });

    it('generates SQL with tett grouping', () => {
      const sql = compile('HAS fiber COUNT hus BY tett', options);

      expect(sql).toContain("CASE WHEN ertett THEN 'Tettsted' ELSE 'Spredt' END AS gruppe");
    });
  });

  describe('speed handling (Mbps direct)', () => {
    it('uses Mbps directly (no conversion)', () => {
      const sql = compile('HAS nedhast >= 100 COUNT hus', options);

      // Now uses ned_mbps directly with Mbps value
      expect(sql).toContain('ned_mbps >= 100');
    });

    it('uses upload Mbps directly', () => {
      const sql = compile('HAS opphast >= 50 COUNT hus', options);

      // Now uses opp_mbps directly with Mbps value
      expect(sql).toContain('opp_mbps >= 50');
    });
  });

  describe('technology mappings', () => {
    it('maps fiber to tek column', () => {
      const sql = compile('HAS fiber COUNT hus', options);
      expect(sql).toContain("tek = 'fiber'");
    });

    it('maps kabel to tek column', () => {
      const sql = compile('HAS kabel COUNT hus', options);
      expect(sql).toContain("tek = 'cable'");
    });

    it('maps 5g to tek column', () => {
      const sql = compile('HAS 5g COUNT hus', options);
      expect(sql).toContain("tek = '5g'");
    });

    it('maps ftb to tek column', () => {
      const sql = compile('HAS ftb COUNT hus', options);
      expect(sql).toContain("tek = 'fwa'");
    });
  });

  describe('metric mappings', () => {
    it('maps hus to hus', () => {
      const sql = compile('HAS fiber COUNT hus', options);
      expect(sql).toContain('SUM(hus)');
    });

    it('maps fritid to fritid', () => {
      const sql = compile('HAS fiber COUNT fritid', options);
      expect(sql).toContain('SUM(fritid)');
    });
  });

  describe('population filters', () => {
    it('generates tett filter', () => {
      const sql = compile('HAS fiber IN tett COUNT hus', options);
      expect(sql).toContain('ertett = true');
    });

    it('generates spredt filter', () => {
      const sql = compile('HAS fiber IN spredt COUNT hus', options);
      expect(sql).toContain('ertett = false');
    });

    it('generates fylke filter', () => {
      const sql = compile('HAS fiber IN fylke = "Oslo" COUNT hus', options);
      expect(sql).toContain("fylke = 'Oslo'");
    });
  });

  describe('boolean expressions', () => {
    it('generates AND expression', () => {
      const sql = compile('HAS fiber AND nedhast >= 100 COUNT hus', options);

      expect(sql).toContain("tek = 'fiber'");
      expect(sql).toContain('ned_mbps >= 100');
      expect(sql).toContain('AND');
    });

    it('generates OR expression', () => {
      const sql = compile('HAS fiber OR kabel COUNT hus', options);

      expect(sql).toContain("tek = 'fiber'");
      expect(sql).toContain("tek = 'cable'");
      expect(sql).toContain('OR');
    });

    it('generates NOT expression', () => {
      const sql = compile('HAS NOT dsl COUNT hus', options);
      expect(sql).toContain("NOT (tek = 'dsl')");
    });

    it('generates nested expression', () => {
      const sql = compile('HAS (fiber OR kabel) AND nedhast >= 100 COUNT hus', options);

      expect(sql).toContain("(tek = 'fiber' OR tek = 'cable')");
      expect(sql).toContain('AND');
      expect(sql).toContain('ned_mbps >= 100');
    });
  });

  describe('quantifiers', () => {
    it('generates ANY as OR', () => {
      const sql = compile('HAS ANY(fiber, kabel) COUNT hus', options);

      expect(sql).toContain("tek = 'fiber' OR tek = 'cable'");
    });

    it('generates ALL as INTERSECT', () => {
      const sql = compile('HAS ALL(fiber, 5g) COUNT hus', options);

      expect(sql).toContain('INTERSECT');
      expect(sql).toContain("tek = 'fiber'");
      expect(sql).toContain("tek = '5g'");
    });

    it('generates NONE as NOT IN', () => {
      const sql = compile('HAS NONE(nedhast >= 30) COUNT hus', options);

      expect(sql).toContain('NOT IN');
      expect(sql).toContain('ned_mbps >= 30');
    });
  });

  describe('output options', () => {
    it('generates count columns for SHOW count', () => {
      const sql = compile('HAS fiber COUNT hus SHOW count', options);

      expect(sql).toContain('covered');
      expect(sql).toContain('total');
      expect(sql).not.toContain('percent');
    });

    it('generates percent column for SHOW andel', () => {
      const sql = compile('HAS fiber COUNT hus SHOW andel', options);

      expect(sql).toContain('percent');
      expect(sql).toContain('ROUND(100.0');
    });

    it('generates all columns for SHOW begge', () => {
      const sql = compile('HAS fiber COUNT hus SHOW begge', options);

      expect(sql).toContain('covered');
      expect(sql).toContain('total');
      expect(sql).toContain('percent');
    });
  });

  describe('sorting', () => {
    it('generates ORDER BY gruppe ASC by default', () => {
      const sql = compile('HAS fiber COUNT hus', options);
      expect(sql).toContain('ORDER BY p.gruppe ASC');
    });

    it('generates ORDER BY percent DESC', () => {
      const sql = compile('HAS fiber COUNT hus SORT andel DESC', options);
      expect(sql).toContain('ORDER BY percent DESC');
    });

    it('generates ORDER BY covered', () => {
      const sql = compile('HAS fiber COUNT hus SORT count ASC', options);
      expect(sql).toContain('ORDER BY covered ASC');
    });
  });

  describe('LIMIT', () => {
    it('generates LIMIT clause', () => {
      const sql = compile('HAS fiber COUNT hus TOP 10', options);
      expect(sql).toContain('LIMIT 10');
    });

    it('omits LIMIT when no TOP', () => {
      const sql = compile('HAS fiber COUNT hus', options);
      expect(sql).not.toMatch(/LIMIT \d+/);
    });
  });

  describe('custom data path', () => {
    it('uses custom data path', () => {
      const sql = compile('HAS fiber COUNT hus', { year: 2024, dataPath: '/custom/path' });

      expect(sql).toContain("'/custom/path/span_adr.parquet'");
      expect(sql).toContain("'/custom/path/span_dekning.parquet'");
    });
  });

  describe('full integration', () => {
    it('generates complete SQL for complex query', () => {
      const sql = compile(
        'HAS fiber AND nedhast >= 100 IN tett COUNT hus BY fylke SHOW begge SORT andel DESC TOP 5',
        options
      );

      // Verify all parts are present
      expect(sql).toContain('WITH population AS');
      expect(sql).toContain('coverage AS');
      expect(sql).toContain("tek = 'fiber'");
      expect(sql).toContain('ned_mbps >= 100');
      expect(sql).toContain('ertett = true');
      expect(sql).toContain('SUM(hus)');
      expect(sql).toContain('fylke AS gruppe');
      // For BY fylke, ORDER BY includes CASE for national total placement
      expect(sql).toContain('percent DESC');
      expect(sql).toContain('LIMIT 5');
    });
  });

  describe('FOR clause', () => {
    it('uses FOR year instead of options.year', () => {
      const sql = compile('HAS fiber COUNT hus FOR 2023', { year: 2024 });

      expect(sql).toContain('aar = 2023');
      expect(sql).not.toContain('aar = 2024');
    });

    it('generates single year SQL for FOR with one year', () => {
      const sql = compile('HAS fiber COUNT hus FOR 2024', {});

      expect(sql).toContain("'data/span_adr.parquet'");
      expect(sql).toContain("'data/span_dekning.parquet'");
      expect(sql).toContain('aar = 2024');
    });

    it('generates multi-year SQL with IN clause', () => {
      const sql = compile('HAS fiber COUNT hus FOR (2023, 2024)', {});

      expect(sql).toContain('aar IN (2023, 2024)');
      expect(sql).toContain("'data/span_adr.parquet'");
      expect(sql).toContain("'data/span_dekning.parquet'");
    });

    it('falls back to options.year when no FOR clause', () => {
      const sql = compile('HAS fiber COUNT hus', { year: 2024 });

      expect(sql).toContain('aar = 2024');
    });
  });

  describe('COUNT subscriptions', () => {
    it('generates SQL for basic subscription count', () => {
      const sql = compile('HAS fiber COUNT subscriptions FOR 2024', {});

      expect(sql).toContain("'data/span_ab.parquet'");
      expect(sql).toContain('COUNT(*)');
      expect(sql).toContain("tek = 'fiber'");
      expect(sql).toContain('aar = 2024');
    });

    it('generates SQL for subscription count by fylke', () => {
      const sql = compile('HAS fiber COUNT subscriptions BY fylke FOR 2024', {});

      expect(sql).toContain('fylke AS gruppe');
      expect(sql).toContain('GROUP BY fylke');
      expect(sql).toContain('COUNT(*)');
    });

    it('generates SQL for subscription count with speed filter', () => {
      const sql = compile('HAS nedhast >= 100 COUNT subscriptions FOR 2024', {});

      expect(sql).toContain('ned_mbps >= 100');
      expect(sql).toContain('COUNT(*)');
    });

    it('generates SQL for private subscriptions', () => {
      const sql = compile('HAS fiber IN private COUNT subscriptions FOR 2024', {});

      expect(sql).toContain('privat = true');
      expect(sql).toContain("tek = 'fiber'");
    });

    it('generates SQL for business subscriptions', () => {
      const sql = compile('HAS fiber IN business COUNT subscriptions FOR 2024', {});

      expect(sql).toContain('privat = false');
    });

    it('generates SQL for private subscriptions by tilb', () => {
      const sql = compile('HAS fiber IN private COUNT subscriptions BY tilb FOR 2024', {});

      expect(sql).toContain('tilb AS gruppe');
      expect(sql).toContain('privat = true');
    });

    it('generates multi-year subscription query', () => {
      const sql = compile('HAS fiber COUNT subscriptions FOR (2023, 2024)', {});

      expect(sql).toContain('aar IN (2023, 2024)');
      expect(sql).toContain(', aar'); // year column in SELECT
      expect(sql).toContain('GROUP BY');
    });

    it('rejects private/business filter with non-subscription metric', () => {
      expect(() => {
        compile('HAS fiber IN private COUNT hus FOR 2024', {});
      }).toThrow('Filters "private" and "business" can only be used with COUNT subscriptions');
    });

    it('rejects business filter with non-subscription metric', () => {
      expect(() => {
        compile('HAS fiber IN business COUNT hus FOR 2024', {});
      }).toThrow('Filters "private" and "business" can only be used with COUNT subscriptions');
    });
  });
});
