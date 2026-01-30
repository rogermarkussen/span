import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/lexer/index.js';

describe('Lexer', () => {
  it('tokenizes minimal query', () => {
    const tokens = tokenize('HAS fiber COUNT homes');

    expect(tokens).toHaveLength(5); // HAS, fiber, COUNT, homes, EOF
    expect(tokens[0]).toMatchObject({ type: 'KEYWORD', value: 'HAS' });
    expect(tokens[1]).toMatchObject({ type: 'IDENTIFIER', value: 'fiber' });
    expect(tokens[2]).toMatchObject({ type: 'KEYWORD', value: 'COUNT' });
    expect(tokens[3]).toMatchObject({ type: 'IDENTIFIER', value: 'homes' });
    expect(tokens[4]).toMatchObject({ type: 'EOF' });
  });

  it('tokenizes full query with all clauses', () => {
    const tokens = tokenize('HAS fiber AND speed >= 100 IN urban COUNT homes BY county SHOW both SORT percent DESC TOP 10');

    const types = tokens.map(t => t.type);
    expect(types).toContain('KEYWORD');
    expect(types).toContain('IDENTIFIER');
    expect(types).toContain('OPERATOR');
    expect(types).toContain('NUMBER');
  });

  it('tokenizes all coverage flags including 5g and 4g', () => {
    const flags = ['fiber', 'cable', 'dsl', '5g', '4g', 'fwa'];

    for (const flag of flags) {
      const tokens = tokenize(`HAS ${flag} COUNT homes`);
      expect(tokens[1]).toMatchObject({ type: 'IDENTIFIER', value: flag });
    }
  });

  it('tokenizes operators correctly', () => {
    const ops = ['=', '!=', '>=', '<=', '>', '<'];

    for (const op of ops) {
      const tokens = tokenize(`HAS speed ${op} 100 COUNT homes`);
      const opToken = tokens.find(t => t.type === 'OPERATOR');
      expect(opToken?.value).toBe(op);
    }
  });

  it('tokenizes string literals', () => {
    const tokens = tokenize('HAS fiber IN county = "Oslo" COUNT homes');
    const stringToken = tokens.find(t => t.type === 'STRING');
    expect(stringToken?.value).toBe('Oslo');
  });

  it('tokenizes parentheses', () => {
    const tokens = tokenize('HAS (fiber OR cable) COUNT homes');

    expect(tokens[1]).toMatchObject({ type: 'LPAREN', value: '(' });
    expect(tokens[5]).toMatchObject({ type: 'RPAREN', value: ')' });
  });

  it('tokenizes quantifiers as keywords', () => {
    const quantifiers = ['ANY', 'ALL', 'NONE'];

    for (const q of quantifiers) {
      const tokens = tokenize(`HAS ${q}(fiber, cable) COUNT homes`);
      expect(tokens[1]).toMatchObject({ type: 'KEYWORD', value: q });
    }
  });

  it('handles whitespace correctly', () => {
    const tokens1 = tokenize('HAS fiber COUNT homes');
    const tokens2 = tokenize('HAS   fiber   COUNT   homes');
    const tokens3 = tokenize('HAS\n  fiber\n  COUNT\n  homes');

    // Should all produce same token sequence (ignoring positions)
    expect(tokens1.map(t => t.value)).toEqual(tokens2.map(t => t.value));
    expect(tokens1.map(t => t.value)).toEqual(tokens3.map(t => t.value));
  });

  it('tracks line and column numbers', () => {
    const tokens = tokenize('HAS fiber\nCOUNT homes');

    expect(tokens[0]).toMatchObject({ line: 1, column: 1 }); // HAS
    expect(tokens[2]).toMatchObject({ line: 2, column: 1 }); // COUNT
  });

  it('throws on unterminated string', () => {
    expect(() => tokenize('HAS fiber IN county = "Oslo COUNT homes')).toThrow('Unterminated string');
  });

  it('distinguishes numbers from 5g/4g', () => {
    const tokens = tokenize('HAS 5g AND speed >= 500 COUNT homes');

    expect(tokens[1]).toMatchObject({ type: 'IDENTIFIER', value: '5g' });
    expect(tokens[5]).toMatchObject({ type: 'NUMBER', value: '500' });
  });

  it('tokenizes FOR keyword', () => {
    const tokens = tokenize('HAS fiber COUNT homes FOR 2024');

    const forToken = tokens.find(t => t.value === 'FOR');
    expect(forToken).toMatchObject({ type: 'KEYWORD', value: 'FOR' });
  });

  it('tokenizes FOR with multiple years', () => {
    const tokens = tokenize('HAS fiber COUNT homes FOR (2023, 2024)');

    const forToken = tokens.find(t => t.value === 'FOR');
    expect(forToken).toMatchObject({ type: 'KEYWORD', value: 'FOR' });

    const lparenIndex = tokens.findIndex(t => t.value === 'FOR') + 1;
    expect(tokens[lparenIndex]).toMatchObject({ type: 'LPAREN', value: '(' });
  });
});
