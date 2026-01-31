export type TokenType =
  | 'KEYWORD'
  | 'IDENTIFIER'
  | 'OPERATOR'
  | 'NUMBER'
  | 'STRING'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  position: number;
  line: number;
  column: number;
}

export const KEYWORDS = new Set([
  'HAS', 'IN', 'COUNT', 'BY', 'SHOW', 'SORT', 'TOP', 'FOR',
  'AND', 'OR', 'NOT', 'ANY', 'ALL', 'NONE'
]);

export const COVERAGE_FLAGS = new Set([
  'fiber', 'kabel', 'dsl', '5g', '4g', 'ftb'
]);

export const POPULATION_FLAGS = new Set([
  'tett', 'spredt', 'private', 'business'
]);

export const METRICS = new Set([
  'hus', 'adr', 'fritid', 'ab'
]);

export const GROUPINGS = new Set([
  'total', 'fylke', 'kom', 'postnr', 'tett', 'tilb', 'tek'
]);

export const OUTPUTS = new Set([
  'count', 'andel', 'begge'
]);

export const SORT_DIRS = new Set([
  'asc', 'desc'
]);

export const SORT_FIELDS = new Set([
  'count', 'andel', 'group'
]);

export const FIELDS = new Set([
  'tek', 'nedhast', 'opphast', 'tilb', 'fylke', 'kom', 'type', 'postnr'
]);

export const OPERATORS = new Set([
  '=', '!=', '>=', '<=', '>', '<'
]);
