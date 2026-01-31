import {
  Token,
  TokenType,
  COVERAGE_FLAGS,
  POPULATION_FLAGS,
  METRICS,
  GROUPINGS,
  OUTPUTS,
  SORT_DIRS,
  SORT_FIELDS,
  FIELDS
} from '../lexer/index.js';
import { ParseError } from '../errors/index.js';
import {
  SpanQuery,
  HasClause,
  InClause,
  InFilter,
  Expression,
  Quantifier,
  Metric,
  Grouping,
  Output,
  SortClause,
  SortDir,
  ComparisonOp,
  CoverageFlag,
  PopulationFlag
} from './ast.js';

export class Parser {
  private tokens: Token[];
  private position = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): SpanQuery {
    const has = this.parseHasClause();
    const inClause = this.parseInClause();
    const count = this.parseCountClause();
    const by = this.parseByClause();
    const show = this.parseShowClause();
    const sort = this.parseSortClause();
    const top = this.parseTopClause();
    const forClause = this.parseForClause();

    this.expect('EOF');

    return { has, in: inClause, count, by, show, sort, top, for: forClause };
  }

  private current(): Token {
    return this.tokens[this.position];
  }

  private advance(): Token {
    const token = this.current();
    this.position++;
    return token;
  }

  private check(type: TokenType, value?: string): boolean {
    const token = this.current();
    if (token.type !== type) return false;
    if (value !== undefined && token.value.toLowerCase() !== value.toLowerCase()) return false;
    return true;
  }

  private checkIdentifier(validSet: Set<string>): boolean {
    const token = this.current();
    if (token.type !== 'IDENTIFIER') return false;
    return validSet.has(token.value.toLowerCase());
  }

  private match(type: TokenType, value?: string): boolean {
    if (this.check(type, value)) {
      this.advance();
      return true;
    }
    return false;
  }

  private expect(type: TokenType, value?: string): Token {
    const token = this.current();
    if (!this.check(type, value)) {
      const expected = value ? `${type} '${value}'` : type;
      throw new ParseError(
        `Expected ${expected}, got ${token.type} '${token.value}'`,
        token.position,
        token.line,
        token.column
      );
    }
    return this.advance();
  }

  private expectIdentifierIn(validSet: Set<string>, name: string): string {
    const token = this.current();
    if (token.type !== 'IDENTIFIER' || !validSet.has(token.value.toLowerCase())) {
      throw new ParseError(
        `Expected ${name}, got '${token.value}'`,
        token.position,
        token.line,
        token.column
      );
    }
    return this.advance().value.toLowerCase();
  }

  private parseHasClause(): HasClause {
    this.expect('KEYWORD', 'HAS');

    // Check for quantifier: ANY, ALL, NONE
    if (this.check('KEYWORD', 'ANY') || this.check('KEYWORD', 'ALL') || this.check('KEYWORD', 'NONE')) {
      const quantifier = this.advance().value as Quantifier;
      this.expect('LPAREN');

      const expressions: Expression[] = [];
      expressions.push(this.parseExpression());

      while (this.match('COMMA')) {
        expressions.push(this.parseExpression());
      }

      this.expect('RPAREN');

      return {
        quantified: { quantifier, expressions },
        expression: null
      };
    }

    // Regular expression
    const expression = this.parseExpression();
    return { quantified: null, expression };
  }

  private parseExpression(): Expression {
    return this.parseOr();
  }

  private parseOr(): Expression {
    let left = this.parseAnd();

    while (this.check('KEYWORD', 'OR')) {
      this.advance();
      const right = this.parseAnd();
      left = { type: 'binary', op: 'OR', left, right };
    }

    return left;
  }

  private parseAnd(): Expression {
    let left = this.parseNot();

    while (this.check('KEYWORD', 'AND')) {
      this.advance();
      const right = this.parseNot();
      left = { type: 'binary', op: 'AND', left, right };
    }

    return left;
  }

  private parseNot(): Expression {
    if (this.check('KEYWORD', 'NOT')) {
      this.advance();
      const expr = this.parseNot();
      return { type: 'not', expr };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): Expression {
    // Parenthesized expression
    if (this.match('LPAREN')) {
      const expr = this.parseExpression();
      this.expect('RPAREN');
      return expr;
    }

    const token = this.current();

    // Coverage flag (fiber, cable, dsl, 5g, 4g, fwa)
    if (this.checkIdentifier(COVERAGE_FLAGS)) {
      const flag = this.advance().value as CoverageFlag;
      return { type: 'flag', flag, negated: false };
    }

    // Comparison: field op value
    if (this.checkIdentifier(FIELDS)) {
      const field = this.advance().value;
      const op = this.expect('OPERATOR').value as ComparisonOp;
      const valueToken = this.current();

      let value: string | number;
      if (this.check('NUMBER')) {
        value = parseInt(this.advance().value, 10);
      } else if (this.check('STRING')) {
        value = this.advance().value;
      } else if (this.checkIdentifier(COVERAGE_FLAGS)) {
        // Allow coverage flags as string values for tech = fiber
        value = this.advance().value;
      } else {
        throw new ParseError(
          `Expected number or string value`,
          valueToken.position,
          valueToken.line,
          valueToken.column
        );
      }

      return { type: 'comparison', field, op, value, negated: false };
    }

    throw new ParseError(
      `Unexpected token in expression: ${token.type} '${token.value}'`,
      token.position,
      token.line,
      token.column
    );
  }

  private parseInClause(): InClause | null {
    if (!this.match('KEYWORD', 'IN')) {
      return null;
    }

    const filters: InFilter[] = [];

    // Parse first filter (required)
    this.parseInFilter(filters);

    // Parse additional filters (comma-separated or space-separated)
    while (this.current().type !== 'KEYWORD' && this.current().type !== 'EOF') {
      if (this.match('COMMA')) {
        // Explicit comma separator
      }
      // Check if this could be a filter
      if (this.checkIdentifier(POPULATION_FLAGS) || this.checkIdentifier(FIELDS)) {
        this.parseInFilter(filters);
      } else {
        break;
      }
    }

    return { filters };
  }

  private parseInFilter(filters: InFilter[]): void {
    // Population flag: urban, rural
    if (this.checkIdentifier(POPULATION_FLAGS)) {
      const flag = this.advance().value as PopulationFlag;
      filters.push({ type: 'population', flag });
      return;
    }

    // Field filter: county = "Oslo"
    if (this.checkIdentifier(FIELDS)) {
      const field = this.advance().value;
      const op = this.expect('OPERATOR').value as ComparisonOp;

      let value: string | number;
      if (this.check('NUMBER')) {
        value = parseInt(this.advance().value, 10);
      } else if (this.check('STRING')) {
        value = this.advance().value;
      } else {
        const token = this.current();
        throw new ParseError(
          `Expected value after operator`,
          token.position,
          token.line,
          token.column
        );
      }

      filters.push({ type: 'field', field, op, value });
      return;
    }

    const token = this.current();
    throw new ParseError(
      `Expected population filter or field filter after IN`,
      token.position,
      token.line,
      token.column
    );
  }

  private parseCountClause(): Metric {
    this.expect('KEYWORD', 'COUNT');

    if (!this.checkIdentifier(METRICS)) {
      const token = this.current();
      throw new ParseError(
        `Expected metric (hus, adr, fritid)`,
        token.position,
        token.line,
        token.column
      );
    }

    return this.advance().value as Metric;
  }

  private parseByClause(): Grouping {
    if (!this.match('KEYWORD', 'BY')) {
      return 'total'; // default
    }

    if (!this.checkIdentifier(GROUPINGS)) {
      const token = this.current();
      throw new ParseError(
        `Expected grouping (total, fylke, kom, postnr, tett, tilb, tek)`,
        token.position,
        token.line,
        token.column
      );
    }

    return this.advance().value as Grouping;
  }

  private parseShowClause(): Output {
    if (!this.match('KEYWORD', 'SHOW')) {
      return 'begge'; // default
    }

    // Handle 'count' which is both a KEYWORD (COUNT) and an output type
    if (this.check('KEYWORD', 'COUNT')) {
      this.advance();
      return 'count';
    }

    if (!this.checkIdentifier(OUTPUTS)) {
      const token = this.current();
      throw new ParseError(
        `Expected output type (count, andel, begge)`,
        token.position,
        token.line,
        token.column
      );
    }

    return this.advance().value as Output;
  }

  private parseSortClause(): SortClause {
    if (!this.match('KEYWORD', 'SORT')) {
      return { field: 'group', dir: 'ASC' }; // default
    }

    // Expect field name: count, andel, or group
    // Handle 'count' which is both a KEYWORD (COUNT) and a sort field
    let field: 'count' | 'andel' | 'group';
    if (this.check('KEYWORD', 'COUNT')) {
      this.advance();
      field = 'count';
    } else if (!this.checkIdentifier(SORT_FIELDS)) {
      const token = this.current();
      throw new ParseError(
        `Expected sort field (count, andel, group)`,
        token.position,
        token.line,
        token.column
      );
    } else {
      field = this.advance().value as 'count' | 'andel' | 'group';
    }

    let dir: SortDir = 'ASC';
    if (this.checkIdentifier(SORT_DIRS)) {
      dir = this.advance().value.toUpperCase() as SortDir;
    }

    return { field, dir };
  }

  private parseTopClause(): number | null {
    if (!this.match('KEYWORD', 'TOP')) {
      return null;
    }

    if (!this.check('NUMBER')) {
      const token = this.current();
      throw new ParseError(
        `Expected number after TOP`,
        token.position,
        token.line,
        token.column
      );
    }

    return parseInt(this.advance().value, 10);
  }

  private parseForClause(): number[] | null {
    if (!this.match('KEYWORD', 'FOR')) {
      return null;
    }

    const years: number[] = [];

    // Check for parenthesized list: FOR (2023, 2024)
    if (this.match('LPAREN')) {
      // First year (required)
      if (!this.check('NUMBER')) {
        const token = this.current();
        throw new ParseError(
          `Expected year number after FOR (`,
          token.position,
          token.line,
          token.column
        );
      }
      years.push(parseInt(this.advance().value, 10));

      // Additional years
      while (this.match('COMMA')) {
        if (!this.check('NUMBER')) {
          const token = this.current();
          throw new ParseError(
            `Expected year number after comma`,
            token.position,
            token.line,
            token.column
          );
        }
        years.push(parseInt(this.advance().value, 10));
      }

      this.expect('RPAREN');
    } else {
      // Single year: FOR 2024
      if (!this.check('NUMBER')) {
        const token = this.current();
        throw new ParseError(
          `Expected year number after FOR`,
          token.position,
          token.line,
          token.column
        );
      }
      years.push(parseInt(this.advance().value, 10));
    }

    return years;
  }
}

export function parse(tokens: Token[]): SpanQuery {
  const parser = new Parser(tokens);
  return parser.parse();
}
