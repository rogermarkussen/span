export type CoverageFlag = 'fiber' | 'cable' | 'dsl' | '5g' | '4g' | 'fwa';
export type PopulationFlag = 'urban' | 'rural';
export type Metric = 'homes' | 'addresses' | 'buildings' | 'cabins';
export type Grouping = 'national' | 'county' | 'municipality' | 'postal' | 'urban' | 'provider' | 'tech';
export type Output = 'count' | 'percent' | 'both';
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
  field: 'count' | 'percent' | 'group';
  dir: SortDir;
}

export interface SpanQuery {
  has: HasClause;
  in: InClause | null;
  count: Metric;
  by: Grouping;
  show: Output;
  sort: SortClause;
  top: number | null;
  for: number[] | null;
}
