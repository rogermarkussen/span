import {
  SpanQuery,
  Expression,
  HasClause,
  InClause,
  Grouping,
  InFilter,
  PopulationFlag
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

  if (grouping === 'total') {
    return "'Norge'";
  }

  if (grouping === 'tett') {
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
  return condition.replace(/\b(fylke|komnavn|ertett|postnr|hus|fritid|bygninger|privat)\b/g, `${tableAlias}.$1`);
}

// Check if a filter is subscription-only (private/business)
function isSubscriptionOnlyFilter(filter: InFilter): boolean {
  return filter.type === 'population' && (filter.flag === 'private' || filter.flag === 'business');
}

// Validate that private/business filters are only used with COUNT subscriptions
function validateFilters(query: SpanQuery): void {
  if (!query.in) return;

  const hasSubscriptionOnlyFilters = query.in.filters.some(isSubscriptionOnlyFilter);

  if (hasSubscriptionOnlyFilters && query.count !== 'subscriptions') {
    throw new CodeGenError(
      'Filters "private" and "business" can only be used with COUNT subscriptions'
    );
  }
}

export function generateSql(query: SpanQuery, options: SqlOptions): string {
  const { dataPath = 'data' } = options;

  // Validate filters
  validateFilters(query);

  // Determine years: use FOR clause if present, otherwise fall back to options.year
  const years = query.for ?? (options.year ? [options.year] : null);

  if (!years || years.length === 0) {
    throw new CodeGenError('No year specified. Use FOR clause or provide year in options.');
  }

  // Route to appropriate generator based on metric
  if (query.count === 'subscriptions') {
    return generateSubscriptionsSql(query, years, dataPath);
  }

  return generateCoverageSql(query, years, dataPath);
}

function generateSubscriptionsSql(query: SpanQuery, years: number[], dataPath: string): string {
  const abTable = `'${dataPath}/span_ab.parquet'`;
  const groupExpr = getGroupingExpr(query.by);

  // Build WHERE conditions
  const conditions: string[] = [];

  // Year filter
  if (years.length === 1) {
    conditions.push(`aar = ${years[0]}`);
  } else {
    conditions.push(`aar IN (${years.join(', ')})`);
  }

  // HAS clause conditions (tech, speed, etc.)
  const coverageCondition = buildCoverageCondition(query.has);
  if (coverageCondition) {
    conditions.push(coverageCondition);
  }

  // IN clause conditions (private, business, county, etc.)
  if (query.in && query.in.filters.length > 0) {
    const inConditions = query.in.filters.map(filter => {
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
    conditions.push(...inConditions);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Build SELECT columns based on SHOW
  const selectCols = buildSubscriptionsSelectColumns(query.show);

  // Build ORDER BY
  const orderBy = buildSubscriptionsOrderBy(query.sort);

  // Build LIMIT
  const limit = query.top ? `LIMIT ${query.top}` : '';

  // Include year column for multi-year queries
  const yearColumn = years.length > 1 ? ', aar' : '';
  const groupByYear = years.length > 1 ? ', aar' : '';

  const sql = `
SELECT ${groupExpr} AS gruppe${yearColumn}${selectCols}
FROM ${abTable}
${whereClause}
GROUP BY ${groupExpr}${groupByYear}
${orderBy}
${limit}`.trim();

  return sql;
}

function buildSubscriptionsSelectColumns(show: 'count' | 'andel' | 'begge'): string {
  // For subscriptions, we only have count (no population to calculate percent from)
  // We'll return count for all show options since percent doesn't make sense
  return ', COUNT(*) AS total';
}

function buildSubscriptionsOrderBy(sort: { field: string; dir: string }): string {
  let orderField: string;

  switch (sort.field) {
    case 'count':
      orderField = 'total';
      break;
    case 'andel':
      // andel doesn't apply to subscriptions, fall back to total
      orderField = 'total';
      break;
    case 'group':
    default:
      orderField = 'gruppe';
      break;
  }

  return `ORDER BY ${orderField} ${sort.dir}`;
}

function generateCoverageSql(query: SpanQuery, years: number[], dataPath: string): string {
  const adrTable = `'${dataPath}/span_adr.parquet'`;
  const dekningTable = `'${dataPath}/span_dekning.parquet'`;

  const metric = METRIC_MAPPINGS[query.count];
  const groupExpr = getGroupingExpr(query.by);
  const groupExprAliased = getGroupingExpr(query.by, 'a');

  // Build year filter
  const yearFilter = years.length === 1
    ? `aar = ${years[0]}`
    : `aar IN (${years.join(', ')})`;

  // Build population WHERE clause (without private/business which are subscription-only)
  const populationWhere = buildPopulationWhere(query.in);

  // Build coverage subquery
  const coverageSubquery = buildCoverageSubquery(query.has, dekningTable, yearFilter);

  // Build SELECT columns based on SHOW
  const selectCols = buildSelectColumns(query.show);

  // Build ORDER BY
  const orderBy = buildOrderBy(query.sort);

  // Build LIMIT
  const limit = query.top ? `LIMIT ${query.top}` : '';

  // Metric column with table alias for coverage CTE
  const metricAliased = metric === '1' ? '1' : `a.${metric}`;

  // Include year column for multi-year queries
  const yearColumn = years.length > 1 ? ', aar' : '';
  const groupByYear = years.length > 1 ? ', aar' : '';
  const yearJoin = years.length > 1 ? ' AND p.aar = c.aar' : '';
  const pYearColumn = years.length > 1 ? ', p.aar' : '';

  // Check if we need national total (BY fylke)
  const needsNationalTotal = query.by === 'fylke';

  // Generate the base SQL with CTEs
  let sql = `
WITH population AS (
  SELECT ${groupExpr} AS gruppe${yearColumn}, SUM(${metric}) AS total
  FROM ${adrTable}
  WHERE ${yearFilter}${populationWhere ? ` AND ${populationWhere}` : ''}
  GROUP BY ${groupExpr}${groupByYear}
),
coverage AS (
  SELECT ${groupExprAliased} AS gruppe${yearColumn.replace(', aar', ', a.aar')}, SUM(${metricAliased}) AS covered
  FROM ${adrTable} a
  WHERE a.${yearFilter} AND a.adrid IN (${coverageSubquery})
  ${populationWhere ? `AND ${addTablePrefix(populationWhere, 'a')}` : ''}
  GROUP BY ${groupExprAliased}${groupByYear.replace(', aar', ', a.aar')}
)`;

  if (needsNationalTotal) {
    // For the outer query, we need to remove table prefix from ORDER BY
    const outerOrderBy = orderBy.replace('p.gruppe', 'gruppe').replace('ORDER BY ', '');
    // by_county CTE always needs covered and total for national aggregation
    const byCountyCols = ', COALESCE(c.covered, 0) AS covered, p.total';
    // Wrap in by_county CTE, then wrap UNION ALL in with_national CTE for proper ORDER BY
    sql += `,
by_county AS (
  SELECT p.gruppe${pYearColumn}${byCountyCols}
  FROM population p
  LEFT JOIN coverage c ON p.gruppe = c.gruppe${yearJoin}
),
with_national AS (
  SELECT * FROM by_county
  UNION ALL
  SELECT 'Norge' AS gruppe${pYearColumn.replace('p.aar', 'aar')}, SUM(covered) AS covered, SUM(total) AS total
  FROM by_county${years.length > 1 ? ' GROUP BY aar' : ''}
)
SELECT gruppe${pYearColumn.replace('p.aar', 'aar')}${buildFinalSelectColumns(query.show)} FROM with_national
ORDER BY CASE WHEN gruppe = 'Norge' THEN 1 ELSE 0 END, ${outerOrderBy}
${limit}`.trim();
  } else {
    sql += `
SELECT p.gruppe${pYearColumn}${selectCols}
FROM population p
LEFT JOIN coverage c ON p.gruppe = c.gruppe${yearJoin}
${orderBy}
${limit}`.trim();
  }

  return sql.trim();
}

function buildNationalSelectColumns(show: 'count' | 'andel' | 'begge'): string {
  switch (show) {
    case 'count':
      return ', SUM(covered) AS covered, SUM(total) AS total';
    case 'andel':
      return ', ROUND(100.0 * SUM(covered) / SUM(total), 1) AS percent';
    case 'begge':
      return ', SUM(covered) AS covered, SUM(total) AS total, ROUND(100.0 * SUM(covered) / SUM(total), 1) AS percent';
  }
}

function buildFinalSelectColumns(show: 'count' | 'andel' | 'begge'): string {
  switch (show) {
    case 'count':
      return ', covered, total';
    case 'andel':
      return ', ROUND(100.0 * covered / total, 1) AS percent';
    case 'begge':
      return ', covered, total, ROUND(100.0 * covered / total, 1) AS percent';
  }
}

function buildCoverageCondition(has: HasClause): string {
  if (has.quantified) {
    const { quantifier, expressions } = has.quantified;

    if (quantifier === 'ANY') {
      return expressions.map(expr => expressionToSql(expr)).join(' OR ');
    }

    if (quantifier === 'ALL') {
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

  // Filter out subscription-only filters (private/business)
  const coverageFilters = inClause.filters.filter(f => !isSubscriptionOnlyFilter(f));

  if (coverageFilters.length === 0) {
    return '';
  }

  const conditions = coverageFilters.map(filter => {
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

function buildCoverageSubquery(has: HasClause, dekningTable: string, yearFilter: string): string {
  if (has.quantified) {
    const { quantifier, expressions } = has.quantified;

    if (quantifier === 'ANY') {
      // ANY: OR of all conditions
      const conditions = expressions.map(expr => expressionToSql(expr)).join(' OR ');
      return `SELECT DISTINCT adrid FROM ${dekningTable} WHERE ${yearFilter} AND (${conditions})`;
    }

    if (quantifier === 'ALL') {
      // ALL: INTERSECT of separate queries
      const subqueries = expressions.map(expr => {
        const condition = expressionToSql(expr);
        return `SELECT DISTINCT adrid FROM ${dekningTable} WHERE ${yearFilter} AND ${condition}`;
      });
      return subqueries.join('\n    INTERSECT\n    ');
    }

    if (quantifier === 'NONE') {
      // NONE: NOT IN (any matching)
      const conditions = expressions.map(expr => expressionToSql(expr)).join(' OR ');
      return `SELECT DISTINCT adrid FROM ${dekningTable} WHERE ${yearFilter} AND adrid NOT IN (
        SELECT adrid FROM ${dekningTable} WHERE ${yearFilter} AND (${conditions})
      )`;
    }
  }

  if (has.expression) {
    const condition = expressionToSql(has.expression);
    return `SELECT DISTINCT adrid FROM ${dekningTable} WHERE ${yearFilter} AND ${condition}`;
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

function buildSelectColumns(show: 'count' | 'andel' | 'begge'): string {
  switch (show) {
    case 'count':
      return ', COALESCE(c.covered, 0) AS covered, p.total';
    case 'andel':
      return ', ROUND(100.0 * COALESCE(c.covered, 0) / p.total, 1) AS percent';
    case 'begge':
      return ', COALESCE(c.covered, 0) AS covered, p.total, ROUND(100.0 * COALESCE(c.covered, 0) / p.total, 1) AS percent';
  }
}

function buildOrderBy(sort: { field: string; dir: string }): string {
  let orderField: string;

  switch (sort.field) {
    case 'count':
      orderField = 'covered';
      break;
    case 'andel':
      orderField = 'percent';
      break;
    case 'group':
    default:
      orderField = 'p.gruppe';
      break;
  }

  return `ORDER BY ${orderField} ${sort.dir}`;
}
