import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/lexer/index.js';
import { parse } from '../src/parser/index.js';

describe('Parser', () => {
  function parseQuery(input: string) {
    const tokens = tokenize(input);
    return parse(tokens);
  }

  describe('minimal queries', () => {
    it('parses HAS fiber COUNT hus', () => {
      const ast = parseQuery('HAS fiber COUNT hus');

      expect(ast.has.expression).toEqual({ type: 'flag', flag: 'fiber', negated: false });
      expect(ast.count).toBe('hus');
      expect(ast.by).toBe('total'); // default
      expect(ast.show).toBe('begge'); // default
      expect(ast.sort).toEqual({ field: 'group', dir: 'ASC' }); // default
      expect(ast.top).toBeNull();
    });

    it('parses all metrics', () => {
      const metrics = ['hus', 'adr', 'fritid'];

      for (const metric of metrics) {
        const ast = parseQuery(`HAS fiber COUNT ${metric}`);
        expect(ast.count).toBe(metric);
      }
    });
  });

  describe('HAS clause expressions', () => {
    it('parses single flag', () => {
      const ast = parseQuery('HAS kabel COUNT hus');
      expect(ast.has.expression).toEqual({ type: 'flag', flag: 'kabel', negated: false });
    });

    it('parses comparison', () => {
      const ast = parseQuery('HAS nedhast >= 100 COUNT hus');
      expect(ast.has.expression).toEqual({
        type: 'comparison',
        field: 'nedhast',
        op: '>=',
        value: 100,
        negated: false
      });
    });

    it('parses AND expression', () => {
      const ast = parseQuery('HAS fiber AND nedhast >= 100 COUNT hus');

      expect(ast.has.expression?.type).toBe('binary');
      if (ast.has.expression?.type === 'binary') {
        expect(ast.has.expression.op).toBe('AND');
        expect(ast.has.expression.left).toEqual({ type: 'flag', flag: 'fiber', negated: false });
        expect(ast.has.expression.right).toEqual({
          type: 'comparison',
          field: 'nedhast',
          op: '>=',
          value: 100,
          negated: false
        });
      }
    });

    it('parses OR expression', () => {
      const ast = parseQuery('HAS fiber OR kabel COUNT hus');

      expect(ast.has.expression?.type).toBe('binary');
      if (ast.has.expression?.type === 'binary') {
        expect(ast.has.expression.op).toBe('OR');
      }
    });

    it('parses NOT expression', () => {
      const ast = parseQuery('HAS NOT dsl COUNT hus');

      expect(ast.has.expression?.type).toBe('not');
      if (ast.has.expression?.type === 'not') {
        expect(ast.has.expression.expr).toEqual({ type: 'flag', flag: 'dsl', negated: false });
      }
    });

    it('parses nested parentheses', () => {
      const ast = parseQuery('HAS (fiber OR kabel) AND nedhast >= 100 COUNT hus');

      expect(ast.has.expression?.type).toBe('binary');
      if (ast.has.expression?.type === 'binary') {
        expect(ast.has.expression.op).toBe('AND');
        expect(ast.has.expression.left.type).toBe('binary');
      }
    });

    it('respects operator precedence: NOT > AND > OR', () => {
      // "a OR b AND c" should parse as "a OR (b AND c)"
      const ast = parseQuery('HAS fiber OR kabel AND 5g COUNT hus');

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
      const ast = parseQuery('HAS ANY(fiber, kabel) COUNT hus');

      expect(ast.has.quantified?.quantifier).toBe('ANY');
      expect(ast.has.quantified?.expressions).toHaveLength(2);
    });

    it('parses ALL quantifier', () => {
      const ast = parseQuery('HAS ALL(fiber, 5g) COUNT adr');

      expect(ast.has.quantified?.quantifier).toBe('ALL');
      expect(ast.has.quantified?.expressions).toHaveLength(2);
    });

    it('parses NONE quantifier', () => {
      const ast = parseQuery('HAS NONE(nedhast >= 30) COUNT hus');

      expect(ast.has.quantified?.quantifier).toBe('NONE');
      expect(ast.has.quantified?.expressions).toHaveLength(1);
      expect(ast.has.quantified?.expressions[0]).toEqual({
        type: 'comparison',
        field: 'nedhast',
        op: '>=',
        value: 30,
        negated: false
      });
    });
  });

  describe('IN clause', () => {
    it('parses tett filter', () => {
      const ast = parseQuery('HAS fiber IN tett COUNT hus');

      expect(ast.in?.filters).toHaveLength(1);
      expect(ast.in?.filters[0]).toEqual({ type: 'population', flag: 'tett' });
    });

    it('parses spredt filter', () => {
      const ast = parseQuery('HAS fiber IN spredt COUNT hus');

      expect(ast.in?.filters).toHaveLength(1);
      expect(ast.in?.filters[0]).toEqual({ type: 'population', flag: 'spredt' });
    });

    it('parses field filter with string', () => {
      const ast = parseQuery('HAS fiber IN fylke = "Oslo" COUNT hus');

      expect(ast.in?.filters).toHaveLength(1);
      expect(ast.in?.filters[0]).toEqual({
        type: 'field',
        field: 'fylke',
        op: '=',
        value: 'Oslo'
      });
    });

    it('parses multiple filters', () => {
      const ast = parseQuery('HAS fiber IN tett fylke = "Oslo" COUNT hus');

      expect(ast.in?.filters).toHaveLength(2);
    });
  });

  describe('BY clause', () => {
    it('defaults to total', () => {
      const ast = parseQuery('HAS fiber COUNT hus');
      expect(ast.by).toBe('total');
    });

    it('parses all groupings', () => {
      const groupings = ['total', 'fylke', 'kom', 'postnr', 'tett', 'tilb', 'tek'];

      for (const grouping of groupings) {
        const ast = parseQuery(`HAS fiber COUNT hus BY ${grouping}`);
        expect(ast.by).toBe(grouping);
      }
    });
  });

  describe('SHOW clause', () => {
    it('defaults to begge', () => {
      const ast = parseQuery('HAS fiber COUNT hus');
      expect(ast.show).toBe('begge');
    });

    it('parses count', () => {
      const ast = parseQuery('HAS fiber COUNT hus SHOW count');
      expect(ast.show).toBe('count');
    });

    it('parses andel', () => {
      const ast = parseQuery('HAS fiber COUNT hus SHOW andel');
      expect(ast.show).toBe('andel');
    });
  });

  describe('SORT clause', () => {
    it('defaults to group ASC', () => {
      const ast = parseQuery('HAS fiber COUNT hus');
      expect(ast.sort).toEqual({ field: 'group', dir: 'ASC' });
    });

    it('parses SORT andel DESC', () => {
      const ast = parseQuery('HAS fiber COUNT hus SORT andel DESC');
      expect(ast.sort).toEqual({ field: 'andel', dir: 'DESC' });
    });

    it('parses SORT count ASC', () => {
      const ast = parseQuery('HAS fiber COUNT hus SORT count ASC');
      expect(ast.sort).toEqual({ field: 'count', dir: 'ASC' });
    });
  });

  describe('TOP clause', () => {
    it('defaults to null', () => {
      const ast = parseQuery('HAS fiber COUNT hus');
      expect(ast.top).toBeNull();
    });

    it('parses TOP 10', () => {
      const ast = parseQuery('HAS fiber COUNT hus TOP 10');
      expect(ast.top).toBe(10);
    });
  });

  describe('full queries', () => {
    it('parses complex query with all clauses', () => {
      const ast = parseQuery('HAS fiber AND nedhast >= 100 IN tett COUNT hus BY fylke SHOW begge SORT andel DESC TOP 5');

      expect(ast.has.expression?.type).toBe('binary');
      expect(ast.in?.filters).toHaveLength(1);
      expect(ast.count).toBe('hus');
      expect(ast.by).toBe('fylke');
      expect(ast.show).toBe('begge');
      expect(ast.sort).toEqual({ field: 'andel', dir: 'DESC' });
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
      expect(() => parseQuery('HAS fiber COUNT hus BY invalid')).toThrow();
    });
  });

  describe('FOR clause', () => {
    it('defaults to null', () => {
      const ast = parseQuery('HAS fiber COUNT hus');
      expect(ast.for).toBeNull();
    });

    it('parses single year', () => {
      const ast = parseQuery('HAS fiber COUNT hus FOR 2024');
      expect(ast.for).toEqual({ type: 'list', years: [2024] });
    });

    it('parses multiple years', () => {
      const ast = parseQuery('HAS fiber COUNT hus FOR (2023, 2024)');
      expect(ast.for).toEqual({ type: 'list', years: [2023, 2024] });
    });

    it('parses FOR with other clauses', () => {
      const ast = parseQuery('HAS fiber COUNT hus BY fylke SORT andel DESC TOP 10 FOR 2024');
      expect(ast.for).toEqual({ type: 'list', years: [2024] });
      expect(ast.by).toBe('fylke');
      expect(ast.top).toBe(10);
    });

    it('parses FOR with three years', () => {
      const ast = parseQuery('HAS fiber COUNT hus FOR (2022, 2023, 2024)');
      expect(ast.for).toEqual({ type: 'list', years: [2022, 2023, 2024] });
    });

    it('parses FOR ar >= 2022', () => {
      const ast = parseQuery('HAS fiber COUNT hus FOR ar >= 2022');
      expect(ast.for).toEqual({ type: 'comparison', op: '>=', value: 2022 });
    });

    it('parses FOR ar = 2024', () => {
      const ast = parseQuery('HAS fiber COUNT hus FOR ar = 2024');
      expect(ast.for).toEqual({ type: 'comparison', op: '=', value: 2024 });
    });

    it('parses FOR ar != 2023', () => {
      const ast = parseQuery('HAS fiber COUNT hus FOR ar != 2023');
      expect(ast.for).toEqual({ type: 'comparison', op: '!=', value: 2023 });
    });

    it('parses FOR ar < 2024', () => {
      const ast = parseQuery('HAS fiber COUNT hus FOR ar < 2024');
      expect(ast.for).toEqual({ type: 'comparison', op: '<', value: 2024 });
    });
  });
});
