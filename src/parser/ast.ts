export type CoverageFlag = 'fiber' | 'kabel' | 'dsl' | '5g' | '4g' | 'ftb';
export type PopulationFlag = 'tett' | 'spredt' | 'private' | 'business';
export type Metric = 'hus' | 'adr' | 'fritid' | 'ab';
export type Grouping = 'total' | 'fylke' | 'kom' | 'postnr' | 'tett' | 'tilb' | 'tek';
export type Output = 'count' | 'andel' | 'begge';
export type SortDir = 'ASC' | 'DESC';
export type Quantifier = 'ANY' | 'ALL' | 'NONE';
export type ComparisonOp = '=' | '!=' | '>=' | '<=' | '>' | '<';

export interface FlagExpression {
  type: 'flag';
  flag: CoverageFlag;
  negated: boolean;
}

export interface ComparisonExpression {
  type: 'comparison';
  field: string;
  op: ComparisonOp;
  value: string | number;
  negated: boolean;
}

export interface BinaryExpression {
  type: 'binary';
  op: 'AND' | 'OR';
  left: Expression;
  right: Expression;
}

export interface NotExpression {
  type: 'not';
  expr: Expression;
}

export type Expression = FlagExpression | ComparisonExpression | BinaryExpression | NotExpression;

export interface QuantifiedExpression {
  quantifier: Quantifier;
  expressions: Expression[];
}

export interface HasClause {
  quantified: QuantifiedExpression | null;
  expression: Expression | null;
}

export interface InClause {
  filters: InFilter[];
}

export type InFilter =
  | { type: 'population'; flag: PopulationFlag }
  | { type: 'field'; field: string; op: ComparisonOp; value: string | number };

export interface SortClause {
  field: 'count' | 'andel' | 'group';
  dir: SortDir;
}

// FOR clause: either explicit list or comparison with 'ar'
export type ForClause =
  | { type: 'list'; years: number[] }
  | { type: 'comparison'; op: ComparisonOp; value: number };

export interface SpanQuery {
  has: HasClause;
  in: InClause | null;
  count: Metric;
  by: Grouping;
  show: Output;
  sort: SortClause;
  top: number | null;
  for: ForClause | null;
}
