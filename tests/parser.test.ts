import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/lexer/index.js';
import { parse } from '../src/parser/index.js';

describe('Parser', () => {
  function parseQuery(input: string) {
    const tokens = tokenize(input);
    return parse(tokens);
  }

  describe('minimal queries', () => {
    it('parses HAS fiber COUNT homes', () => {
      const ast = parseQuery('HAS fiber COUNT homes');

      expect(ast.has.expression).toEqual({ type: 'flag', flag: 'fiber', negated: false });
      expect(ast.count).toBe('homes');
      expect(ast.by).toBe('national'); // default
      expect(ast.show).toBe('both'); // default
      expect(ast.sort).toEqual({ field: 'group', dir: 'ASC' }); // default
      expect(ast.top).toBeNull();
    });

    it('parses all metrics', () => {
      const metrics = ['homes', 'addresses', 'buildings', 'cabins'];

      for (const metric of metrics) {
        const ast = parseQuery(`HAS fiber COUNT ${metric}`);
        expect(ast.count).toBe(metric);
      }
    });
  });

  describe('HAS clause expressions', () => {
    it('parses single flag', () => {
      const ast = parseQuery('HAS cable COUNT homes');
      expect(ast.has.expression).toEqual({ type: 'flag', flag: 'cable', negated: false });
    });

    it('parses comparison', () => {
      const ast = parseQuery('HAS speed >= 100 COUNT homes');
      expect(ast.has.expression).toEqual({
        type: 'comparison',
        field: 'speed',
        op: '>=',
        value: 100,
        negated: false
      });
    });

    it('parses AND expression', () => {
      const ast = parseQuery('HAS fiber AND speed >= 100 COUNT homes');

      expect(ast.has.expression?.type).toBe('binary');
      if (ast.has.expression?.type === 'binary') {
        expect(ast.has.expression.op).toBe('AND');
        expect(ast.has.expression.left).toEqual({ type: 'flag', flag: 'fiber', negated: false });
        expect(ast.has.expression.right).toEqual({
          type: 'comparison',
          field: 'speed',
          op: '>=',
          value: 100,
          negated: false
        });
      }
    });

    it('parses OR expression', () => {
      const ast = parseQuery('HAS fiber OR cable COUNT homes');

      expect(ast.has.expression?.type).toBe('binary');
      if (ast.has.expression?.type === 'binary') {
        expect(ast.has.expression.op).toBe('OR');
      }
    });

    it('parses NOT expression', () => {
      const ast = parseQuery('HAS NOT dsl COUNT homes');

      expect(ast.has.expression?.type).toBe('not');
      if (ast.has.expression?.type === 'not') {
        expect(ast.has.expression.expr).toEqual({ type: 'flag', flag: 'dsl', negated: false });
      }
    });

    it('parses nested parentheses', () => {
      const ast = parseQuery('HAS (fiber OR cable) AND speed >= 100 COUNT homes');

      expect(ast.has.expression?.type).toBe('binary');
      if (ast.has.expression?.type === 'binary') {
        expect(ast.has.expression.op).toBe('AND');
        expect(ast.has.expression.left.type).toBe('binary');
      }
    });

    it('respects operator precedence: NOT > AND > OR', () => {
      // "a OR b AND c" should parse as "a OR (b AND c)"
      const ast = parseQuery('HAS fiber OR cable AND 5g COUNT homes');

      expect(ast.has.expression?.type).toBe('binary');
      if (ast.has.expression?.type === 'binary') {
        expect(ast.has.expression.op).toBe('OR');
        expect(ast.has.expression.left).toEqual({ type: 'flag', flag: 'fiber', negated: false });
        expect(ast.has.expression.right.type).toBe('binary');
        if (ast.has.expression.right.type === 'binary') {
          expect(ast.has.expression.right.op).toBe('AND');
        }
      }
    });
  });

  describe('quantifiers', () => {
    it('parses ANY quantifier', () => {
      const ast = parseQuery('HAS ANY(fiber, cable) COUNT homes');

      expect(ast.has.quantified?.quantifier).toBe('ANY');
      expect(ast.has.quantified?.expressions).toHaveLength(2);
    });

    it('parses ALL quantifier', () => {
      const ast = parseQuery('HAS ALL(fiber, 5g) COUNT addresses');

      expect(ast.has.quantified?.quantifier).toBe('ALL');
      expect(ast.has.quantified?.expressions).toHaveLength(2);
    });

    it('parses NONE quantifier', () => {
      const ast = parseQuery('HAS NONE(speed >= 30) COUNT homes');

      expect(ast.has.quantified?.quantifier).toBe('NONE');
      expect(ast.has.quantified?.expressions).toHaveLength(1);
      expect(ast.has.quantified?.expressions[0]).toEqual({
        type: 'comparison',
        field: 'speed',
        op: '>=',
        value: 30,
        negated: false
      });
    });
  });

  describe('IN clause', () => {
    it('parses urban filter', () => {
      const ast = parseQuery('HAS fiber IN urban COUNT homes');

      expect(ast.in?.filters).toHaveLength(1);
      expect(ast.in?.filters[0]).toEqual({ type: 'population', flag: 'urban' });
    });

    it('parses rural filter', () => {
      const ast = parseQuery('HAS fiber IN rural COUNT homes');

      expect(ast.in?.filters).toHaveLength(1);
      expect(ast.in?.filters[0]).toEqual({ type: 'population', flag: 'rural' });
    });

    it('parses field filter with string', () => {
      const ast = parseQuery('HAS fiber IN county = "Oslo" COUNT homes');

      expect(ast.in?.filters).toHaveLength(1);
      expect(ast.in?.filters[0]).toEqual({
        type: 'field',
        field: 'county',
        op: '=',
        value: 'Oslo'
      });
    });

    it('parses multiple filters', () => {
      const ast = parseQuery('HAS fiber IN urban county = "Oslo" COUNT homes');

      expect(ast.in?.filters).toHaveLength(2);
    });
  });

  describe('BY clause', () => {
    it('defaults to national', () => {
      const ast = parseQuery('HAS fiber COUNT homes');
      expect(ast.by).toBe('national');
    });

    it('parses all groupings', () => {
      const groupings = ['national', 'county', 'municipality', 'postal', 'urban', 'provider', 'tech'];

      for (const grouping of groupings) {
        const ast = parseQuery(`HAS fiber COUNT homes BY ${grouping}`);
        expect(ast.by).toBe(grouping);
      }
    });
  });

  describe('SHOW clause', () => {
    it('defaults to both', () => {
      const ast = parseQuery('HAS fiber COUNT homes');
      expect(ast.show).toBe('both');
    });

    it('parses count', () => {
      const ast = parseQuery('HAS fiber COUNT homes SHOW count');
      expect(ast.show).toBe('count');
    });

    it('parses percent', () => {
      const ast = parseQuery('HAS fiber COUNT homes SHOW percent');
      expect(ast.show).toBe('percent');
    });
  });

  describe('SORT clause', () => {
    it('defaults to group ASC', () => {
      const ast = parseQuery('HAS fiber COUNT homes');
      expect(ast.sort).toEqual({ field: 'group', dir: 'ASC' });
    });

    it('parses SORT percent DESC', () => {
      const ast = parseQuery('HAS fiber COUNT homes SORT percent DESC');
      expect(ast.sort).toEqual({ field: 'percent', dir: 'DESC' });
    });

    it('parses SORT count ASC', () => {
      const ast = parseQuery('HAS fiber COUNT homes SORT count ASC');
      expect(ast.sort).toEqual({ field: 'count', dir: 'ASC' });
    });
  });

  describe('TOP clause', () => {
    it('defaults to null', () => {
      const ast = parseQuery('HAS fiber COUNT homes');
      expect(ast.top).toBeNull();
    });

    it('parses TOP 10', () => {
      const ast = parseQuery('HAS fiber COUNT homes TOP 10');
      expect(ast.top).toBe(10);
    });
  });

  describe('full queries', () => {
    it('parses complex query with all clauses', () => {
      const ast = parseQuery('HAS fiber AND speed >= 100 IN urban COUNT homes BY county SHOW both SORT percent DESC TOP 5');

      expect(ast.has.expression?.type).toBe('binary');
      expect(ast.in?.filters).toHaveLength(1);
      expect(ast.count).toBe('homes');
      expect(ast.by).toBe('county');
      expect(ast.show).toBe('both');
      expect(ast.sort).toEqual({ field: 'percent', dir: 'DESC' });
      expect(ast.top).toBe(5);
    });
  });

  describe('error handling', () => {
    it('throws on missing COUNT', () => {
      expect(() => parseQuery('HAS fiber')).toThrow();
    });

    it('throws on missing metric', () => {
      expect(() => parseQuery('HAS fiber COUNT')).toThrow();
    });

    it('throws on invalid grouping', () => {
      expect(() => parseQuery('HAS fiber COUNT homes BY invalid')).toThrow();
    });
  });

  describe('FOR clause', () => {
    it('defaults to null', () => {
      const ast = parseQuery('HAS fiber COUNT homes');
      expect(ast.for).toBeNull();
    });

    it('parses single year', () => {
      const ast = parseQuery('HAS fiber COUNT homes FOR 2024');
      expect(ast.for).toEqual([2024]);
    });

    it('parses multiple years', () => {
      const ast = parseQuery('HAS fiber COUNT homes FOR (2023, 2024)');
      expect(ast.for).toEqual([2023, 2024]);
    });

    it('parses FOR with other clauses', () => {
      const ast = parseQuery('HAS fiber COUNT homes BY county SORT percent DESC TOP 10 FOR 2024');
      expect(ast.for).toEqual([2024]);
      expect(ast.by).toBe('county');
      expect(ast.top).toBe(10);
    });

    it('parses FOR with three years', () => {
      const ast = parseQuery('HAS fiber COUNT homes FOR (2022, 2023, 2024)');
      expect(ast.for).toEqual([2022, 2023, 2024]);
    });
  });
});
