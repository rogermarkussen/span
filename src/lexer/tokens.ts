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
  'fiber', 'cable', 'dsl', '5g', '4g', 'fwa'
]);

export const POPULATION_FLAGS = new Set([
  'urban', 'rural'
]);

export const METRICS = new Set([
  'homes', 'addresses', 'buildings', 'cabins'
]);

export const GROUPINGS = new Set([
  'national', 'county', 'municipality', 'postal', 'urban', 'provider', 'tech'
]);

export const OUTPUTS = new Set([
  'count', 'percent', 'both'
]);

export const SORT_DIRS = new Set([
  'asc', 'desc'
]);

export const SORT_FIELDS = new Set([
  'count', 'percent', 'group'
]);

export const FIELDS = new Set([
  'tech', 'speed', 'upload', 'provider', 'county', 'municipality', 'type', 'postal'
]);

export const OPERATORS = new Set([
  '=', '!=', '>=', '<=', '>', '<'
]);
