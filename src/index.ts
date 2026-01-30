import { tokenize } from './lexer/index.js';
import { parse as parseTokens, SpanQuery } from './parser/index.js';
import { generateSql, SqlOptions } from './codegen/index.js';

export function parse(input: string): SpanQuery {
  const tokens = tokenize(input);
  return parseTokens(tokens);
}

export function toSql(query: SpanQuery, options: SqlOptions): string {
  return generateSql(query, options);
}

export function compile(input: string, options: SqlOptions): string {
  const ast = parse(input);
  return toSql(ast, options);
}

// Re-export types and utilities
export { tokenize } from './lexer/index.js';
export type { Token, TokenType } from './lexer/index.js';

export { parse as parseTokens, Parser } from './parser/index.js';
export type {
  SpanQuery,
  HasClause,
  InClause,
  InFilter,
  Expression,
  FlagExpression,
  ComparisonExpression,
  BinaryExpression,
  NotExpression,
  QuantifiedExpression,
  SortClause,
  CoverageFlag,
  PopulationFlag,
  Metric,
  Grouping,
  Output,
  SortDir,
  Quantifier,
  ComparisonOp
} from './parser/index.js';

export { generateSql } from './codegen/index.js';
export type { SqlOptions } from './codegen/index.js';
export {
  TECH_MAPPINGS,
  METRIC_MAPPINGS,
  GROUPING_MAPPINGS,
  POPULATION_MAPPINGS,
  FIELD_MAPPINGS,
  convertSpeed,
  isSpeedField
} from './codegen/index.js';

export { SpanError, LexerError, ParseError, CodeGenError } from './errors/index.js';
