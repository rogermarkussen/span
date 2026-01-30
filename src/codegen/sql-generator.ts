import {
  SpanQuery,
  Expression,
  HasClause,
  InClause,
  Grouping
} from '../parser/ast.js';
import { CodeGenError } from '../errors/index.js';
import {
  TECH_MAPPINGS,
  METRIC_MAPPINGS,
  GROUPING_MAPPINGS,
  POPULATION_MAPPINGS,
  FIELD_MAPPINGS,
  convertSpeed,
  isSpeedField
} from './mappings.js';

export interface SqlOptions {
  year?: number;
  dataPath?: string;
}

function getGroupingExpr(grouping: Grouping, tableAlias?: string): string {
  const expr = GROUPING_MAPPINGS[grouping];

  if (grouping === 'national') {
    return "'Norge'";
  }

  if (grouping === 'urban') {
    if (tableAlias) {
      return `CASE WHEN ${tableAlias}.ertett THEN 'Tettsted' ELSE 'Spredt' END`;
    }
    return "CASE WHEN ertett THEN 'Tettsted' ELSE 'Spredt' END";
  }

  // Simple column reference
  if (tableAlias) {
    return `${tableAlias}.${expr}`;
  }
  return expr;
}

function addTablePrefix(condition: string, tableAlias: string): string {
  return condition.replace(/\b(fylke|komnavn|ertett|postnr|hus|fritid|bygninger)\b/g, `${tableAlias}.$1`);
}

export function generateSql(query: SpanQuery, options: SqlOptions): string {
  const { dataPath = 'data' } = options;

  // Determine years: use FOR clause if present, otherwise fall back to options.year
  const years = query.for ?? (options.year ? [options.year] : null);

  if (!years || years.length === 0) {
    throw new CodeGenError('No year specified. Use FOR clause or provide year in options.');
  }

  // Single year: use simple table references
  if (years.length === 1) {
    return generateSingleYearSql(query, years[0], dataPath);
  }

  // Multiple years: use UNION ALL pattern
  return generateMultiYearSql(query, years, dataPath);
}

function generateSingleYearSql(query: SpanQuery, year: number, dataPath: string): string {
  const adrTable = `'${dataPath}/${year}/adr.parquet'`;
  const fbbTable = `'${dataPath}/${year}/fbb.parquet'`;
  const mobTable = `'${dataPath}/${year}/mob.parquet'`;

  const metric = METRIC_MAPPINGS[query.count];
  const groupExpr = getGroupingExpr(query.by);
  const groupExprAliased = getGroupingExpr(query.by, 'a');

  // Build population WHERE clause
  const populationWhere = buildPopulationWhere(query.in);

  // Build coverage subquery
  const coverageSubquery = buildCoverageSubquery(query.has, fbbTable, mobTable, year);

  // Build SELECT columns based on SHOW
  const selectCols = buildSelectColumns(query.show);

  // Build ORDER BY
  const orderBy = buildOrderBy(query.sort);

  // Build LIMIT
  const limit = query.top ? `LIMIT ${query.top}` : '';

  // Metric column with table alias for coverage CTE
  const metricAliased = metric === '1' ? '1' : `a.${metric}`;

  // Generate the full SQL
  const sql = `
WITH population AS (
  SELECT ${groupExpr} AS gruppe, SUM(${metric}) AS total
  FROM ${adrTable}
  ${populationWhere ? `WHERE ${populationWhere}` : ''}
  GROUP BY ${groupExpr}
),
coverage AS (
  SELECT ${groupExprAliased} AS gruppe, SUM(${metricAliased}) AS covered
  FROM ${adrTable} a
  WHERE a.adrid IN (${coverageSubquery})
  ${populationWhere ? `AND ${addTablePrefix(populationWhere, 'a')}` : ''}
  GROUP BY ${groupExprAliased}
)
SELECT p.gruppe${selectCols}
FROM population p
LEFT JOIN coverage c ON p.gruppe = c.gruppe
${orderBy}
${limit}`.trim();

  return sql;
}

function generateMultiYearSql(query: SpanQuery, years: number[], dataPath: string): string {
  const metric = METRIC_MAPPINGS[query.count];
  const groupExpr = getGroupingExpr(query.by);
  const groupExprAliased = getGroupingExpr(query.by, 'a');

  // Build population WHERE clause
  const populationWhere = buildPopulationWhere(query.in);

  // Build SELECT columns based on SHOW
  const selectCols = buildSelectColumns(query.show);

  // Build ORDER BY
  const orderBy = buildOrderBy(query.sort);

  // Build LIMIT
  const limit = query.top ? `LIMIT ${query.top}` : '';

  // Metric column with table alias for coverage CTE
  const metricAliased = metric === '1' ? '1' : `a.${metric}`;

  // Build UNION ALL for adr tables
  const adrUnion = years
    .map(y => `SELECT *, ${y} AS aar FROM '${dataPath}/${y}/adr.parquet'`)
    .join('\n  UNION ALL\n  ');

  // Build UNION ALL for fbb tables
  const fbbUnion = years
    .map(y => `SELECT *, ${y} AS aar FROM '${dataPath}/${y}/fbb.parquet'`)
    .join('\n  UNION ALL\n  ');

  // Build coverage subquery using fbb_union
  const coverageCondition = buildCoverageCondition(query.has);

  // Generate the full SQL with unions
  const sql = `
WITH adr_union AS (
  ${adrUnion}
),
fbb_union AS (
  ${fbbUnion}
),
population AS (
  SELECT ${groupExpr} AS gruppe, aar, SUM(${metric}) AS total
  FROM adr_union
  ${populationWhere ? `WHERE ${populationWhere}` : ''}
  GROUP BY ${groupExpr}, aar
),
coverage AS (
  SELECT ${groupExprAliased} AS gruppe, a.aar, SUM(${metricAliased}) AS covered
  FROM adr_union a
  WHERE EXISTS (
    SELECT 1 FROM fbb_union f
    WHERE f.adrid = a.adrid AND f.aar = a.aar AND ${coverageCondition}
  )
  ${populationWhere ? `AND ${addTablePrefix(populationWhere, 'a')}` : ''}
  GROUP BY ${groupExprAliased}, a.aar
)
SELECT p.gruppe, p.aar${selectCols}
FROM population p
LEFT JOIN coverage c ON p.gruppe = c.gruppe AND p.aar = c.aar
${orderBy}
${limit}`.trim();

  return sql;
}

function buildCoverageCondition(has: HasClause): string {
  if (has.quantified) {
    const { quantifier, expressions } = has.quantified;

    if (quantifier === 'ANY') {
      return expressions.map(expr => expressionToSql(expr)).join(' OR ');
    }

    if (quantifier === 'ALL') {
      // For multi-year with ALL, we need a different approach
      // Simplified: require all conditions in single row (may need refinement)
      return expressions.map(expr => expressionToSql(expr)).join(' AND ');
    }

    if (quantifier === 'NONE') {
      const conditions = expressions.map(expr => expressionToSql(expr)).join(' OR ');
      return `NOT (${conditions})`;
    }
  }

  if (has.expression) {
    return expressionToSql(has.expression);
  }

  throw new CodeGenError('HAS clause must have either quantified or expression');
}

function buildPopulationWhere(inClause: InClause | null): string {
  if (!inClause || inClause.filters.length === 0) {
    return '';
  }

  const conditions = inClause.filters.map(filter => {
    if (filter.type === 'population') {
      return POPULATION_MAPPINGS[filter.flag];
    } else {
      const sqlField = FIELD_MAPPINGS[filter.field] || filter.field;
      let value = filter.value;

      if (isSpeedField(filter.field) && typeof value === 'number') {
        value = convertSpeed(value);
      }

      if (typeof value === 'string') {
        return `${sqlField} ${filter.op} '${value}'`;
      }
      return `${sqlField} ${filter.op} ${value}`;
    }
  });

  return conditions.join(' AND ');
}

function buildCoverageSubquery(has: HasClause, fbbTable: string, mobTable: string, year: number): string {
  if (has.quantified) {
    const { quantifier, expressions } = has.quantified;

    if (quantifier === 'ANY') {
      // ANY: OR of all conditions
      const conditions = expressions.map(expr => expressionToSql(expr)).join(' OR ');
      return `SELECT DISTINCT adrid FROM ${fbbTable} WHERE ${conditions}`;
    }

    if (quantifier === 'ALL') {
      // ALL: INTERSECT of separate queries
      const subqueries = expressions.map(expr => {
        const condition = expressionToSql(expr);
        return `SELECT DISTINCT adrid FROM ${fbbTable} WHERE ${condition}`;
      });
      return subqueries.join('\n    INTERSECT\n    ');
    }

    if (quantifier === 'NONE') {
      // NONE: NOT IN (any matching)
      const conditions = expressions.map(expr => expressionToSql(expr)).join(' OR ');
      return `SELECT DISTINCT adrid FROM ${fbbTable} WHERE adrid NOT IN (
        SELECT adrid FROM ${fbbTable} WHERE ${conditions}
      )`;
    }
  }

  if (has.expression) {
    const condition = expressionToSql(has.expression);
    return `SELECT DISTINCT adrid FROM ${fbbTable} WHERE ${condition}`;
  }

  throw new CodeGenError('HAS clause must have either quantified or expression');
}

function expressionToSql(expr: Expression): string {
  switch (expr.type) {
    case 'flag': {
      const sql = TECH_MAPPINGS[expr.flag];
      return expr.negated ? `NOT (${sql})` : sql;
    }

    case 'comparison': {
      const sqlField = FIELD_MAPPINGS[expr.field] || expr.field;
      let value = expr.value;

      if (isSpeedField(expr.field) && typeof value === 'number') {
        value = convertSpeed(value);
      }

      let condition: string;
      if (typeof value === 'string') {
        condition = `${sqlField} ${expr.op} '${value}'`;
      } else {
        condition = `${sqlField} ${expr.op} ${value}`;
      }

      return expr.negated ? `NOT (${condition})` : condition;
    }

    case 'binary': {
      const left = expressionToSql(expr.left);
      const right = expressionToSql(expr.right);
      return `(${left} ${expr.op} ${right})`;
    }

    case 'not': {
      const inner = expressionToSql(expr.expr);
      return `NOT (${inner})`;
    }

    default:
      throw new CodeGenError(`Unknown expression type: ${(expr as Expression).type}`);
  }
}

function buildSelectColumns(show: 'count' | 'percent' | 'both'): string {
  switch (show) {
    case 'count':
      return ', COALESCE(c.covered, 0) AS covered, p.total';
    case 'percent':
      return ', ROUND(100.0 * COALESCE(c.covered, 0) / p.total, 1) AS percent';
    case 'both':
      return ', COALESCE(c.covered, 0) AS covered, p.total, ROUND(100.0 * COALESCE(c.covered, 0) / p.total, 1) AS percent';
  }
}

function buildOrderBy(sort: { field: string; dir: string }): string {
  let orderField: string;

  switch (sort.field) {
    case 'count':
      orderField = 'covered';
      break;
    case 'percent':
      orderField = 'percent';
      break;
    case 'group':
    default:
      orderField = 'gruppe';
      break;
  }

  return `ORDER BY ${orderField} ${sort.dir}`;
}
