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

      // Should aggregate from by_county CTE for national total
      expect(sql).toContain('SUM(covered) AS covered');
      expect(sql).toContain('SUM(total) AS total');
      // Percent is calculated in final SELECT
      expect(sql).toContain('ROUND(100.0 * covered / total, 1) AS percent');
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

    it('generates fylke filter (case-insensitive)', () => {
      const sql = compile('HAS fiber IN fylke = "Oslo" COUNT hus', options);
      expect(sql).toContain("UPPER(fylke) = UPPER('Oslo')");
    });

    it('generates kom filter (case-insensitive)', () => {
      const sql = compile('HAS fiber IN kom = "Lillesand" COUNT hus', options);
      expect(sql).toContain("UPPER(komnavn) = UPPER('Lillesand')");
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

  describe('FOR with operators', () => {
    it('resolves FOR ar >= 2022 to all years from 2022', () => {
      const sql = compile('HAS fiber COUNT hus BY fylke FOR ar >= 2022', {});

      // Should generate pivot SQL with all three years
      expect(sql).toContain('AS "2022"');
      expect(sql).toContain('AS "2023"');
      expect(sql).toContain('AS "2024"');
    });

    it('resolves FOR ar = 2024 to single year', () => {
      const sql = compile('HAS fiber COUNT hus FOR ar = 2024', {});

      expect(sql).toContain('aar = 2024');
      expect(sql).not.toContain('AS "2022"');
    });

    it('resolves FOR ar != 2023 to 2022 and 2024', () => {
      const sql = compile('HAS fiber COUNT hus BY fylke FOR ar != 2023', {});

      expect(sql).toContain('AS "2022"');
      expect(sql).toContain('AS "2024"');
      expect(sql).not.toContain('AS "2023"');
    });

    it('resolves FOR ar > 2022 to 2023 and 2024', () => {
      const sql = compile('HAS fiber COUNT hus BY fylke FOR ar > 2022', {});

      expect(sql).not.toContain('AS "2022"');
      expect(sql).toContain('AS "2023"');
      expect(sql).toContain('AS "2024"');
    });

    it('resolves FOR ar <= 2023 to 2022 and 2023', () => {
      const sql = compile('HAS fiber COUNT hus BY fylke FOR ar <= 2023', {});

      expect(sql).toContain('AS "2022"');
      expect(sql).toContain('AS "2023"');
      expect(sql).not.toContain('AS "2024"');
    });
  });

  describe('pivot SQL for multi-year', () => {
    it('generates pivot SQL with years as columns', () => {
      const sql = compile('HAS fiber COUNT hus BY fylke FOR (2022, 2023, 2024)', {});

      // Should have year columns
      expect(sql).toContain('AS "2022"');
      expect(sql).toContain('AS "2023"');
      expect(sql).toContain('AS "2024"');
      // Should use CASE WHEN for pivot
      expect(sql).toContain('CASE WHEN aar = 2022');
      expect(sql).toContain('CASE WHEN aar = 2023');
      expect(sql).toContain('CASE WHEN aar = 2024');
      // Should calculate percent
      expect(sql).toContain('ROUND(100.0');
    });

    it('generates pivot SQL with national total for BY fylke', () => {
      const sql = compile('HAS fiber COUNT hus BY fylke FOR ar >= 2022', {});

      expect(sql).toContain('with_national');
      expect(sql).toContain("'Norge' AS gruppe");
      expect(sql).toContain("CASE WHEN gruppe = 'Norge' THEN 1 ELSE 0 END");
    });

    it('generates pivot SQL without national total for BY kom', () => {
      const sql = compile('HAS fiber COUNT hus BY kom FOR (2023, 2024)', {});

      expect(sql).not.toContain('with_national');
      expect(sql).not.toContain("'Norge' AS gruppe");
    });

    it('applies population filter in pivot SQL', () => {
      const sql = compile('HAS fiber IN tett COUNT hus BY fylke FOR ar >= 2022', {});

      expect(sql).toContain('ertett = true');
    });
  });

  describe('COUNT ab', () => {
    it('generates SQL for basic subscription count', () => {
      const sql = compile('HAS fiber COUNT ab FOR 2024', {});

      expect(sql).toContain("'data/span_ab.parquet'");
      expect(sql).toContain('COUNT(*)');
      expect(sql).toContain("tek = 'fiber'");
      expect(sql).toContain('aar = 2024');
    });

    it('generates SQL for subscription count by fylke', () => {
      const sql = compile('HAS fiber COUNT ab BY fylke FOR 2024', {});

      // Uses fylke mapping CTE to normalize historical county names to 2024 names
      // Two-step approach: 1) JOIN span_adr for address-level fylke, 2) fallback to fylke_mapping, 3) fallback to ab.fylke
      expect(sql).toContain('fylke_mapping');
      expect(sql).toContain('span_adr.parquet');
      expect(sql).toContain('COALESCE(adr.fylke, m.fylke24, ab.fylke) AS gruppe');
      expect(sql).toContain('GROUP BY COALESCE(adr.fylke, m.fylke24, ab.fylke)');
      expect(sql).toContain('COUNT(*)');
    });

    it('generates SQL for subscription count with speed filter', () => {
      const sql = compile('HAS nedhast >= 100 COUNT ab FOR 2024', {});

      expect(sql).toContain('ned_mbps >= 100');
      expect(sql).toContain('COUNT(*)');
    });

    it('generates SQL for private ab', () => {
      const sql = compile('HAS fiber IN private COUNT ab FOR 2024', {});

      expect(sql).toContain('privat = true');
      expect(sql).toContain("tek = 'fiber'");
    });

    it('generates SQL for business ab', () => {
      const sql = compile('HAS fiber IN business COUNT ab FOR 2024', {});

      expect(sql).toContain('privat = false');
    });

    it('generates SQL for private ab by tilb', () => {
      const sql = compile('HAS fiber IN private COUNT ab BY tilb FOR 2024', {});

      expect(sql).toContain('tilb AS gruppe');
      expect(sql).toContain('privat = true');
    });

    it('generates multi-year subscription query', () => {
      const sql = compile('HAS fiber COUNT ab FOR (2023, 2024)', {});

      expect(sql).toContain('aar IN (2023, 2024)');
      expect(sql).toContain(', aar'); // year column in SELECT
      expect(sql).toContain('GROUP BY');
    });

    it('rejects private/business filter with non-subscription metric', () => {
      expect(() => {
        compile('HAS fiber IN private COUNT hus FOR 2024', {});
      }).toThrow('Filters "private" and "business" can only be used with COUNT ab');
    });

    it('rejects business filter with non-subscription metric', () => {
      expect(() => {
        compile('HAS fiber IN business COUNT hus FOR 2024', {});
      }).toThrow('Filters "private" and "business" can only be used with COUNT ab');
    });

    it('includes national total for ab BY fylke', () => {
      const sql = compile('HAS fiber COUNT ab BY fylke FOR 2024', {});

      expect(sql).toContain('UNION ALL');
      expect(sql).toContain("'Norge' AS gruppe");
      expect(sql).toContain('SUM(total)');
      expect(sql).toContain("CASE WHEN gruppe = 'Norge' THEN 1 ELSE 0 END");
    });

    it('does not add national total for ab BY kom', () => {
      const sql = compile('HAS fiber COUNT ab BY kom FOR 2024', {});

      expect(sql).not.toContain('UNION ALL');
      expect(sql).not.toContain("'Norge' AS gruppe");
    });
  });
});
