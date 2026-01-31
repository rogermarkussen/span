import {
  SpanQuery,
  Expression,
  HasClause,
  InClause,
  Grouping,
  InFilter,
  PopulationFlag,
  ForClause,
  ComparisonOp,
  DataSource
} from '../parser/ast.js';
import { CodeGenError } from '../errors/index.js';
import {
  TECH_MAPPINGS,
  METRIC_MAPPINGS,
  GROUPING_MAPPINGS,
  POPULATION_MAPPINGS,
  FIELD_MAPPINGS,
  DATA_SOURCE_FILTERS,
  convertSpeed,
  isSpeedField,
  HISTORIKK_CUTOFF_YEAR,
  HISTORIKK_TECHNOLOGIES,
  HISTORIKK_SPEED_THRESHOLDS,
  HISTORIKK_SUPPORTED_GROUPINGS,
  HISTORIKK_GEO_MAPPINGS,
  isHistorikkSpeedSupported,
  isHistorikkTechSupported,
  buildHistorikkSpeedIndicator
} from './mappings.js';

export interface SqlOptions {
  year?: number;
  dataPath?: string;
}

// Available years for address-level data
const AVAILABLE_YEARS = [2022, 2023, 2024];

// All available years including historical
const ALL_AVAILABLE_YEARS = [2010, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

// CTE for mapping historical county names to 2024 county names
// Uses data/2022/adr.parquet which has both fylke (historical) and fylke24 (2024 name)
// For municipalities with addresses in multiple 2024-fylker (e.g., Asker in both Akershus and Buskerud),
// we pick the fylke24 with the most addresses to avoid row duplication during JOIN
function getFylkeMappingCte(dataPath: string): string {
  return `fylke_mapping AS (
  SELECT komnavn, gammelt_fylke, fylke24
  FROM (
    SELECT komnavn, fylke AS gammelt_fylke, fylke24,
      ROW_NUMBER() OVER (PARTITION BY komnavn, fylke ORDER BY COUNT(*) DESC) as rn
    FROM '${dataPath}/2022/adr.parquet'
    WHERE fylke24 IS NOT NULL
    GROUP BY komnavn, fylke, fylke24
  )
  WHERE rn = 1
)`;
}

// Get data source filter condition (or null for no filter)
function getDataSourceFilter(source: DataSource): string | null {
  return DATA_SOURCE_FILTERS[source];
}

// Resolve years from ForClause
function resolveYears(forClause: ForClause | null, options: SqlOptions): number[] {
  if (!forClause) {
    return options.year ? [options.year] : [];
  }

  if (forClause.type === 'list') {
    return forClause.years;
  }

  // Comparison: For operators like >=, <=, we need to decide which years to include
  // We include historical years if the comparison could potentially match any of them
  const { op, value } = forClause;

  // Include historical years if the comparison could match any year before HISTORIKK_CUTOFF_YEAR
  // Examples:
  //   ar < 2024 -> could match 2010, 2012, ... 2023, so include all
  //   ar >= 2015 -> could match 2015+, so include all (historical + modern)
  //   ar = 2015 -> explicit historical year, include all
  //   ar != 2023 -> could match historical years, include all
  const couldMatchHistorical = (
    (op === '=' && value < HISTORIKK_CUTOFF_YEAR) ||
    (op === '<') ||
    (op === '<=') ||
    (op === '>=') ||
    (op === '>') ||
    (op === '!=')
  );

  const yearsToFilter = couldMatchHistorical ? ALL_AVAILABLE_YEARS : AVAILABLE_YEARS;

  return yearsToFilter.filter(year => {
    switch (op) {
      case '>=': return year >= value;
      case '<=': return year <= value;
      case '>': return year > value;
      case '<': return year < value;
      case '=': return year === value;
      case '!=': return year !== value;
      default: return false;
    }
  });
}

// Check if query requires historical data (years before HISTORIKK_CUTOFF_YEAR)
function hasHistoricalYears(years: number[]): boolean {
  return years.some(year => year < HISTORIKK_CUTOFF_YEAR);
}

// Check if query can be answered using historikk.parquet
interface HistorikkValidation {
  canUse: boolean;
  error?: string;
}

function validateHistorikkQuery(query: SpanQuery, years: number[]): HistorikkValidation {
  // Check grouping - only total and tett are supported
  if (!(HISTORIKK_SUPPORTED_GROUPINGS as readonly string[]).includes(query.by)) {
    return {
      canUse: false,
      error: `Gruppering "${query.by}" er ikke tilgjengelig for historiske data (før ${HISTORIKK_CUTOFF_YEAR}). ` +
        `Støttede grupperinger: ${HISTORIKK_SUPPORTED_GROUPINGS.join(', ')}.`
    };
  }

  // Check IN filters - no tilbyder or fylke filters allowed
  if (query.in) {
    for (const filter of query.in.filters) {
      if (filter.type === 'field') {
        if (filter.field === 'tilb') {
          return {
            canUse: false,
            error: `Tilbyder-filter er ikke tilgjengelig for historiske data (før ${HISTORIKK_CUTOFF_YEAR}).`
          };
        }
        if (filter.field === 'fylke' || filter.field === 'kom') {
          return {
            canUse: false,
            error: `Geografisk filter "${filter.field}" er ikke tilgjengelig for historiske data (før ${HISTORIKK_CUTOFF_YEAR}). ` +
              `Historisk data finnes kun på nasjonalt nivå og tett/spredt.`
          };
        }
      }
      if (filter.type === 'population' && (filter.flag === 'privat' || filter.flag === 'bedrift')) {
        return {
          canUse: false,
          error: `Filter "${filter.flag}" er ikke tilgjengelig for historiske data (før ${HISTORIKK_CUTOFF_YEAR}).`
        };
      }
    }
  }

  // Check HAS clause conditions
  if (query.has) {
    const hasValidation = validateHistorikkHasClause(query.has);
    if (!hasValidation.canUse) {
      return hasValidation;
    }
  }

  // Check SHOW - count is not available for historikk
  if (query.show === 'count') {
    return {
      canUse: false,
      error: `SHOW count er ikke tilgjengelig for historiske data (før ${HISTORIKK_CUTOFF_YEAR}). ` +
        `Historisk data har kun dekningsandeler (prosent), ikke antall. Bruk SHOW andel.`
    };
  }

  return { canUse: true };
}

function validateHistorikkHasClause(has: HasClause): HistorikkValidation {
  if (has.quantified) {
    for (const expr of has.quantified.expressions) {
      const validation = validateHistorikkExpression(expr);
      if (!validation.canUse) return validation;
    }
  }
  if (has.expression) {
    return validateHistorikkExpression(has.expression);
  }
  return { canUse: true };
}

function validateHistorikkExpression(expr: Expression): HistorikkValidation {
  switch (expr.type) {
    case 'flag':
      if (!isHistorikkTechSupported(expr.flag)) {
        return {
          canUse: false,
          error: `Teknologi "${expr.flag}" er ikke tilgjengelig i historisk data. ` +
            `Støttede teknologier: ${HISTORIKK_TECHNOLOGIES.join(', ')}.`
        };
      }
      return { canUse: true };

    case 'comparison':
      if (expr.field === 'nedhast') {
        const mbps = typeof expr.value === 'number' ? expr.value : parseInt(expr.value as string, 10);
        if (!isHistorikkSpeedSupported(mbps)) {
          return {
            canUse: false,
            error: `Hastighetsterskel ${mbps} Mbps er ikke tilgjengelig i historisk data. ` +
              `Støttede terskler: ${HISTORIKK_SPEED_THRESHOLDS.join(', ')} Mbps.`
          };
        }
        return { canUse: true };
      }
      if (expr.field === 'opphast') {
        // opphast alene er ikke støttet, men det håndteres sammen med nedhast
        return { canUse: true };
      }
      if (expr.field === 'tilb') {
        return {
          canUse: false,
          error: `Tilbyder-filter er ikke tilgjengelig for historiske data (før ${HISTORIKK_CUTOFF_YEAR}).`
        };
      }
      if (expr.field === 'tek') {
        const tech = expr.value as string;
        if (!isHistorikkTechSupported(tech)) {
          return {
            canUse: false,
            error: `Teknologi "${tech}" er ikke tilgjengelig i historisk data. ` +
              `Støttede teknologier: ${HISTORIKK_TECHNOLOGIES.join(', ')}.`
          };
        }
        return { canUse: true };
      }
      return { canUse: true };

    case 'binary':
      const leftVal = validateHistorikkExpression(expr.left);
      if (!leftVal.canUse) return leftVal;
      return validateHistorikkExpression(expr.right);

    case 'not':
      return validateHistorikkExpression(expr.expr);

    default:
      return { canUse: true };
  }
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

// Check if a filter is subscription-only (privat/bedrift)
function isSubscriptionOnlyFilter(filter: InFilter): boolean {
  return filter.type === 'population' && (filter.flag === 'privat' || filter.flag === 'bedrift');
}

// Validate that privat/bedrift filters are only used with COUNT ab
function validateFilters(query: SpanQuery): void {
  if (!query.in) return;

  const hasSubscriptionOnlyFilters = query.in.filters.some(isSubscriptionOnlyFilter);

  if (hasSubscriptionOnlyFilters && query.count !== 'ab') {
    throw new CodeGenError(
      'Filters "privat" and "bedrift" can only be used with COUNT ab'
    );
  }
}

export function generateSql(query: SpanQuery, options: SqlOptions): string {
  const { dataPath = 'data' } = options;

  // Validate filters
  validateFilters(query);

  // Resolve years from FOR clause
  const years = resolveYears(query.for, options);

  if (years.length === 0) {
    throw new CodeGenError('No year specified. Use FOR clause or provide year in options.');
  }

  // Check if any years require historical data
  if (hasHistoricalYears(years)) {
    // Validate that query can be answered with historical data
    const validation = validateHistorikkQuery(query, years);
    if (!validation.canUse) {
      throw new CodeGenError(validation.error!);
    }

    // Use historikk.parquet for ALL years when query includes historical years
    // This ensures consistent methodology and values across all years
    // historikk.parquet contains data for 2022-2024 as well
    return generateHistorikkSql(query, years, dataPath);
  }

  // Route to appropriate generator based on metric
  if (query.count === 'ab') {
    return generateSubscriptionsSql(query, years, dataPath);
  }

  // Multi-year with grouping: use pivot format
  if (years.length > 1 && query.by !== 'total') {
    return generatePivotSql(query, years, dataPath);
  }

  return generateCoverageSql(query, years, dataPath);
}

// Generate SQL for historical data (years < 2022)
function generateHistorikkSql(query: SpanQuery, years: number[], dataPath: string): string {
  const historikkTable = `'${dataPath}/historikk.parquet'`;

  // Build WHERE conditions
  const conditions: string[] = [];

  // Year filter
  if (years.length === 1) {
    conditions.push(`aar = ${years[0]}`);
  } else {
    conditions.push(`aar IN (${years.join(', ')})`);
  }

  // Geo filter from BY clause and IN filters
  const geoFilter = buildHistorikkGeoFilter(query);
  if (geoFilter) {
    conditions.push(geoFilter);
  }

  // Indikator filter from HAS clause
  const indikatorFilter = buildHistorikkIndikatorFilter(query.has);
  if (indikatorFilter) {
    conditions.push(indikatorFilter);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Build SELECT and grouping
  const isMultiYear = years.length > 1;
  const isByTett = query.by === 'tett';

  let sql: string;

  if (isMultiYear && isByTett) {
    // Pivot by year and geo
    const yearColumns = years.map(year =>
      `ROUND(MAX(CASE WHEN aar = ${year} THEN dekning END) * 100, 1) AS "${year}"`
    ).join(',\n    ');

    sql = `
SELECT
    CASE WHEN geo = 'tettbygd' THEN 'Tettsted' WHEN geo = 'spredtbygd' THEN 'Spredt' ELSE 'Norge' END AS gruppe,
    ${yearColumns}
FROM ${historikkTable}
${whereClause}
GROUP BY geo
ORDER BY CASE WHEN geo = 'totalt' THEN 1 WHEN geo = 'tettbygd' THEN 2 ELSE 3 END`.trim();
  } else if (isMultiYear) {
    // Multi-year, BY total - pivot by year
    const yearColumns = years.map(year =>
      `ROUND(MAX(CASE WHEN aar = ${year} THEN dekning END) * 100, 1) AS "${year}"`
    ).join(',\n    ');

    sql = `
SELECT
    'Norge' AS gruppe,
    ${yearColumns}
FROM ${historikkTable}
${whereClause}`.trim();
  } else if (isByTett) {
    // Single year, BY tett - group by geo
    sql = `
SELECT
    CASE WHEN geo = 'tettbygd' THEN 'Tettsted' WHEN geo = 'spredtbygd' THEN 'Spredt' ELSE 'Norge' END AS gruppe,
    ROUND(dekning * 100, 1) AS andel
FROM ${historikkTable}
${whereClause}
ORDER BY CASE WHEN geo = 'totalt' THEN 1 WHEN geo = 'tettbygd' THEN 2 ELSE 3 END`.trim();
  } else {
    // Single year, BY total
    sql = `
SELECT
    'Norge' AS gruppe,
    ROUND(dekning * 100, 1) AS andel
FROM ${historikkTable}
${whereClause}`.trim();
  }

  // Add TOP limit if specified
  if (query.top) {
    sql += `\nLIMIT ${query.top}`;
  }

  return sql;
}

function buildHistorikkGeoFilter(query: SpanQuery): string | null {
  // Check IN clause for tett/spredt filters
  if (query.in) {
    for (const filter of query.in.filters) {
      if (filter.type === 'population') {
        if (filter.flag === 'tett') {
          return "geo = 'tettbygd'";
        }
        if (filter.flag === 'spredt') {
          return "geo = 'spredtbygd'";
        }
      }
    }
  }

  // If BY tett, include all geo values
  if (query.by === 'tett') {
    return "geo IN ('totalt', 'tettbygd', 'spredtbygd')";
  }

  // BY total - use totalt
  return "geo = 'totalt'";
}

function buildHistorikkIndikatorFilter(has: HasClause | null): string | null {
  if (!has) {
    return null;
  }

  if (has.quantified) {
    const { quantifier, expressions } = has.quantified;

    if (quantifier === 'ANY') {
      const filters = expressions.map(expr => buildHistorikkExpressionFilter(expr)).filter(Boolean);
      return filters.length > 0 ? `(${filters.join(' OR ')})` : null;
    }

    if (quantifier === 'ALL') {
      // ALL with multiple expressions is tricky for historikk
      // For now, we'll just AND them which works if they're compatible
      const filters = expressions.map(expr => buildHistorikkExpressionFilter(expr)).filter(Boolean);
      return filters.length > 0 ? `(${filters.join(' AND ')})` : null;
    }

    if (quantifier === 'NONE') {
      const filters = expressions.map(expr => buildHistorikkExpressionFilter(expr)).filter(Boolean);
      return filters.length > 0 ? `NOT (${filters.join(' OR ')})` : null;
    }
  }

  if (has.expression) {
    return buildHistorikkExpressionFilter(has.expression);
  }

  return null;
}

function buildHistorikkExpressionFilter(expr: Expression): string | null {
  switch (expr.type) {
    case 'flag': {
      const filter = `(type = 'tek' AND indikator = '${expr.flag}')`;
      return expr.negated ? `NOT ${filter}` : filter;
    }

    case 'comparison': {
      if (expr.field === 'nedhast') {
        const mbps = typeof expr.value === 'number' ? expr.value : parseInt(expr.value as string, 10);
        const indicator = buildHistorikkSpeedIndicator(mbps);
        const filter = `(type = 'hast' AND indikator = '${indicator}')`;
        return expr.negated ? `NOT ${filter}` : filter;
      }
      if (expr.field === 'tek') {
        const filter = `(type = 'tek' AND indikator = '${expr.value}')`;
        return expr.negated ? `NOT ${filter}` : filter;
      }
      return null;
    }

    case 'binary': {
      const left = buildHistorikkExpressionFilter(expr.left);
      const right = buildHistorikkExpressionFilter(expr.right);
      if (left && right) {
        return `(${left} ${expr.op} ${right})`;
      }
      return left || right;
    }

    case 'not': {
      const inner = buildHistorikkExpressionFilter(expr.expr);
      return inner ? `NOT (${inner})` : null;
    }

    default:
      return null;
  }
}

function generateSubscriptionsSql(query: SpanQuery, years: number[], dataPath: string): string {
  // Multi-year with grouping: use pivot format
  if (years.length > 1 && query.by !== 'total') {
    return generateSubscriptionsPivotSql(query, years, dataPath);
  }

  const abTable = `'${dataPath}/span_ab.parquet'`;
  const adrTable = `'${dataPath}/span_adr.parquet'`;
  const isByFylke = query.by === 'fylke';

  // Build WHERE conditions
  const conditions: string[] = [];

  // Year filter
  if (years.length === 1) {
    conditions.push(`${isByFylke ? 'ab.' : ''}aar = ${years[0]}`);
  } else {
    conditions.push(`${isByFylke ? 'ab.' : ''}aar IN (${years.join(', ')})`);
  }

  // HAS clause conditions (tech, speed, etc.) - only if HAS is specified
  if (query.has) {
    const coverageCondition = buildCoverageCondition(query.has);
    if (coverageCondition) {
      if (isByFylke) {
        conditions.push(coverageCondition.replace(/\b(tek|ned_mbps|opp_mbps)\b/g, 'ab.$1'));
      } else {
        conditions.push(coverageCondition);
      }
    }
  }

  // IN clause conditions (privat, bedrift, county, etc.)
  if (query.in && query.in.filters.length > 0) {
    const inConditions = query.in.filters.map(filter => {
      if (filter.type === 'population') {
        const mapped = POPULATION_MAPPINGS[filter.flag];
        return isByFylke ? mapped.replace(/\b(privat)\b/g, 'ab.$1') : mapped;
      } else {
        const sqlField = FIELD_MAPPINGS[filter.field] || filter.field;
        let value = filter.value;

        if (isSpeedField(filter.field) && typeof value === 'number') {
          value = convertSpeed(value);
        }

        const prefix = isByFylke ? 'ab.' : '';
        if (typeof value === 'string') {
          // Case-insensitive matching for fylke og kommune
          if (filter.field === 'fylke' || filter.field === 'kom') {
            return `UPPER(${prefix}${sqlField}) ${filter.op} UPPER('${value}')`;
          }
          return `${prefix}${sqlField} ${filter.op} '${value}'`;
        }
        return `${prefix}${sqlField} ${filter.op} ${value}`;
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

  let sql: string;

  if (isByFylke) {
    // Use fylke mapping CTE to normalize historical county names to 2024 names
    // Two-step approach: 1) JOIN span_adr for ~81% of rows, 2) fallback to fylke_mapping, 3) fallback to ab.fylke
    const mappingCte = getFylkeMappingCte(dataPath);

    // Wrap in CTEs and add national total with UNION ALL
    sql = `
WITH ${mappingCte},
by_fylke AS (
  SELECT COALESCE(adr.fylke, m.fylke24, ab.fylke) AS gruppe${yearColumn}${selectCols}
  FROM ${abTable} ab
  LEFT JOIN ${adrTable} adr ON ab.adrid = adr.adrid AND ab.aar = adr.aar
  LEFT JOIN fylke_mapping m ON ab.komnavn = m.komnavn AND ab.fylke = m.gammelt_fylke
  ${whereClause}
  GROUP BY COALESCE(adr.fylke, m.fylke24, ab.fylke)${groupByYear}
),
with_national AS (
  SELECT * FROM by_fylke
  UNION ALL
  SELECT 'Norge' AS gruppe${yearColumn}${selectCols.replace('COUNT(*)', 'SUM(total)')}
  FROM by_fylke${years.length > 1 ? ' GROUP BY aar' : ''}
)
SELECT * FROM with_national
ORDER BY CASE WHEN gruppe = 'Norge' THEN 1 ELSE 0 END, ${query.sort.field === 'count' ? 'total' : 'gruppe'} ${query.sort.dir}
${limit}`.trim();
  } else {
    const groupExpr = getGroupingExpr(query.by);
    sql = `
SELECT ${groupExpr} AS gruppe${yearColumn}${selectCols}
FROM ${abTable}
${whereClause}
GROUP BY ${groupExpr}${groupByYear}
${orderBy}
${limit}`.trim();
  }

  return sql;
}

function generateSubscriptionsPivotSql(query: SpanQuery, years: number[], dataPath: string): string {
  const abTable = `'${dataPath}/span_ab.parquet'`;
  const adrTable = `'${dataPath}/span_adr.parquet'`;

  // Build WHERE conditions (without year - that's handled in pivot)
  const conditions: string[] = [];

  // Year filter for all years
  conditions.push(`ab.aar IN (${years.join(', ')})`);

  // HAS clause conditions (tech, speed, etc.) - only if HAS is specified
  if (query.has) {
    const coverageCondition = buildCoverageCondition(query.has);
    if (coverageCondition) {
      // Add ab. prefix to coverage condition fields
      conditions.push(coverageCondition.replace(/\b(tek|ned_mbps|opp_mbps)\b/g, 'ab.$1'));
    }
  }

  // IN clause conditions (privat, bedrift, county, etc.)
  if (query.in && query.in.filters.length > 0) {
    const inConditions = query.in.filters.map(filter => {
      if (filter.type === 'population') {
        // Add ab. prefix to population mapping
        return POPULATION_MAPPINGS[filter.flag].replace(/\b(privat)\b/g, 'ab.$1');
      } else {
        const sqlField = FIELD_MAPPINGS[filter.field] || filter.field;
        let value = filter.value;

        if (isSpeedField(filter.field) && typeof value === 'number') {
          value = convertSpeed(value);
        }

        if (typeof value === 'string') {
          // Case-insensitive matching for fylke og kommune
          if (filter.field === 'fylke' || filter.field === 'kom') {
            return `UPPER(ab.${sqlField}) ${filter.op} UPPER('${value}')`;
          }
          return `ab.${sqlField} ${filter.op} '${value}'`;
        }
        return `ab.${sqlField} ${filter.op} ${value}`;
      }
    });
    conditions.push(...inConditions);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Generate CASE WHEN for each year (pivot columns showing count)
  const yearColumns = years.map(year =>
    `SUM(CASE WHEN ab.aar = ${year} THEN 1 ELSE 0 END) AS "${year}"`
  ).join(',\n    ');

  // Build LIMIT
  const limit = query.top ? `LIMIT ${query.top}` : '';

  // Check if we need fylke mapping (BY fylke)
  const isByFylke = query.by === 'fylke';

  let sql: string;

  if (isByFylke) {
    // Use fylke mapping CTE to normalize historical county names to 2024 names
    // Two-step approach: 1) JOIN span_adr for ~81% of rows, 2) fallback to fylke_mapping, 3) fallback to ab.fylke
    const mappingCte = getFylkeMappingCte(dataPath);

    // Generate year columns for national total (sum of sums)
    const yearColumnsNational = years.map(year => `SUM("${year}") AS "${year}"`).join(', ');

    sql = `
WITH ${mappingCte},
by_group AS (
  SELECT COALESCE(adr.fylke, m.fylke24, ab.fylke) AS gruppe,
    ${yearColumns}
  FROM ${abTable} ab
  LEFT JOIN ${adrTable} adr ON ab.adrid = adr.adrid AND ab.aar = adr.aar
  LEFT JOIN fylke_mapping m ON ab.komnavn = m.komnavn AND ab.fylke = m.gammelt_fylke
  ${whereClause}
  GROUP BY COALESCE(adr.fylke, m.fylke24, ab.fylke)
),
with_national AS (
  SELECT * FROM by_group
  UNION ALL
  SELECT 'Norge' AS gruppe, ${yearColumnsNational}
  FROM by_group
)
SELECT * FROM with_national
ORDER BY CASE WHEN gruppe = 'Norge' THEN 1 ELSE 0 END, gruppe ASC
${limit}`.trim();
  } else {
    const groupExpr = getGroupingExpr(query.by);
    // For non-fylke groupings, use simpler query without ab. prefix
    const simpleYearColumns = years.map(year =>
      `SUM(CASE WHEN aar = ${year} THEN 1 ELSE 0 END) AS "${year}"`
    ).join(',\n    ');
    sql = `
SELECT ${groupExpr} AS gruppe,
    ${simpleYearColumns}
FROM ${abTable}
${whereClause.replace(/\bab\./g, '')}
GROUP BY ${groupExpr}
ORDER BY gruppe ASC
${limit}`.trim();
  }

  return sql;
}

function buildSubscriptionsSelectColumns(show: 'count' | 'andel' | 'begge'): string {
  // For ab, we only have count (no population to calculate percent from)
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
      // andel doesn't apply to ab, fall back to total
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
  const sourceFilter = getDataSourceFilter(query.source);

  const metric = METRIC_MAPPINGS[query.count];
  const groupExpr = getGroupingExpr(query.by);

  // Build year filter
  const yearFilter = years.length === 1
    ? `aar = ${years[0]}`
    : `aar IN (${years.join(', ')})`;

  // Build population WHERE clause (without privat/bedrift which are subscription-only)
  const populationWhere = buildPopulationWhere(query.in);

  // Build ORDER BY
  const orderBy = buildOrderBy(query.sort);

  // Build LIMIT
  const limit = query.top ? `LIMIT ${query.top}` : '';

  // Include year column for multi-year queries
  const yearColumn = years.length > 1 ? ', aar' : '';
  const groupByYear = years.length > 1 ? ', aar' : '';

  // Check if we need national total (BY fylke)
  const needsNationalTotal = query.by === 'fylke';

  // If no HAS clause, generate simple aggregation without coverage filter
  if (!query.has) {
    return generateAllAddressesSql(query, years, dataPath, adrTable, metric, groupExpr, yearFilter, populationWhere, yearColumn, groupByYear, orderBy, limit, needsNationalTotal);
  }

  const groupExprAliased = getGroupingExpr(query.by, 'a');

  // Build coverage subquery - use correlated subquery for multi-year to match correct year
  const coverageSubquery = years.length > 1
    ? buildCoverageSubqueryForPivot(query.has, dekningTable, sourceFilter)
    : buildCoverageSubquery(query.has, dekningTable, yearFilter, sourceFilter);

  // Build SELECT columns based on SHOW
  const selectCols = buildSelectColumns(query.show);

  // Metric column with table alias for coverage CTE
  const metricAliased = metric === '1' ? '1' : `a.${metric}`;

  const yearJoin = years.length > 1 ? ' AND p.aar = c.aar' : '';
  const pYearColumn = years.length > 1 ? ', p.aar' : '';

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

// Generate SQL for queries without HAS clause (count all addresses)
function generateAllAddressesSql(
  query: SpanQuery,
  years: number[],
  dataPath: string,
  adrTable: string,
  metric: string,
  groupExpr: string,
  yearFilter: string,
  populationWhere: string,
  yearColumn: string,
  groupByYear: string,
  orderBy: string,
  limit: string,
  needsNationalTotal: boolean
): string {
  // For queries without HAS, covered = total (all addresses are "covered")
  const pYearColumn = years.length > 1 ? ', aar' : '';

  let sql: string;

  if (needsNationalTotal) {
    const outerOrderBy = orderBy.replace('p.gruppe', 'gruppe').replace('ORDER BY ', '');
    sql = `
WITH by_group AS (
  SELECT ${groupExpr} AS gruppe${yearColumn}, SUM(${metric}) AS total
  FROM ${adrTable}
  WHERE ${yearFilter}${populationWhere ? ` AND ${populationWhere}` : ''}
  GROUP BY ${groupExpr}${groupByYear}
),
with_national AS (
  SELECT * FROM by_group
  UNION ALL
  SELECT 'Norge' AS gruppe${pYearColumn}, SUM(total) AS total
  FROM by_group${years.length > 1 ? ' GROUP BY aar' : ''}
)
SELECT gruppe${pYearColumn}, total FROM with_national
ORDER BY CASE WHEN gruppe = 'Norge' THEN 1 ELSE 0 END, ${outerOrderBy}
${limit}`.trim();
  } else {
    sql = `
SELECT ${groupExpr} AS gruppe${yearColumn}, SUM(${metric}) AS total
FROM ${adrTable}
WHERE ${yearFilter}${populationWhere ? ` AND ${populationWhere}` : ''}
GROUP BY ${groupExpr}${groupByYear}
${orderBy.replace('p.gruppe', 'gruppe')}
${limit}`.trim();
  }

  return sql;
}

function generatePivotSql(query: SpanQuery, years: number[], dataPath: string): string {
  const adrTable = `'${dataPath}/span_adr.parquet'`;
  const dekningTable = `'${dataPath}/span_dekning.parquet'`;
  const sourceFilter = getDataSourceFilter(query.source);

  const metric = METRIC_MAPPINGS[query.count];
  const groupExpr = getGroupingExpr(query.by);

  // Build population WHERE clause
  const populationWhere = buildPopulationWhere(query.in);

  // Build year filter for all years
  const yearFilter = `aar IN (${years.join(', ')})`;

  // Build ORDER BY (for pivot, only group makes sense)
  const orderBy = buildPivotOrderBy(query.sort, query.by);

  // Build LIMIT
  const limit = query.top ? `LIMIT ${query.top}` : '';

  // Check if we need national total (BY fylke)
  const needsNationalTotal = query.by === 'fylke';

  // If no HAS clause, generate simple pivot without coverage filter
  if (!query.has) {
    return generateAllAddressesPivotSql(query, years, dataPath, adrTable, metric, groupExpr, yearFilter, populationWhere, orderBy, limit, needsNationalTotal);
  }

  const groupExprAliased = getGroupingExpr(query.by, 'a');

  // Build coverage subquery with year correlation
  const coverageSubqueryBase = buildCoverageSubqueryForPivot(query.has, dekningTable, sourceFilter);

  // Metric column with table alias
  const metricAliased = metric === '1' ? '1' : `a.${metric}`;

  // Generate CASE WHEN for each year (pivot columns showing percent)
  const yearColumns = years.map(year =>
    `ROUND(100.0 * SUM(CASE WHEN aar = ${year} THEN covered ELSE 0 END) /
     NULLIF(SUM(CASE WHEN aar = ${year} THEN total ELSE 0 END), 0), 1) AS "${year}"`
  ).join(',\n    ');

  let sql = `
WITH population AS (
  SELECT ${groupExpr} AS gruppe, aar, SUM(${metric}) AS total
  FROM ${adrTable}
  WHERE ${yearFilter}${populationWhere ? ` AND ${populationWhere}` : ''}
  GROUP BY ${groupExpr}, aar
),
coverage AS (
  SELECT ${groupExprAliased} AS gruppe, a.aar, SUM(${metricAliased}) AS covered
  FROM ${adrTable} a
  WHERE a.${yearFilter} AND a.adrid IN (${coverageSubqueryBase})
  ${populationWhere ? `AND ${addTablePrefix(populationWhere, 'a')}` : ''}
  GROUP BY ${groupExprAliased}, a.aar
),
joined AS (
  SELECT p.gruppe, p.aar, COALESCE(c.covered, 0) AS covered, p.total
  FROM population p
  LEFT JOIN coverage c ON p.gruppe = c.gruppe AND p.aar = c.aar
)`;

  if (needsNationalTotal) {
    sql += `,
with_national AS (
  SELECT * FROM joined
  UNION ALL
  SELECT 'Norge' AS gruppe, aar, SUM(covered) AS covered, SUM(total) AS total
  FROM joined
  GROUP BY aar
)
SELECT
    gruppe,
    ${yearColumns}
FROM with_national
GROUP BY gruppe
ORDER BY CASE WHEN gruppe = 'Norge' THEN 1 ELSE 0 END, gruppe ASC
${limit}`.trim();
  } else {
    sql += `
SELECT
    gruppe,
    ${yearColumns}
FROM joined
GROUP BY gruppe
${orderBy}
${limit}`.trim();
  }

  return sql.trim();
}

// Generate pivot SQL for queries without HAS clause (count all addresses)
function generateAllAddressesPivotSql(
  query: SpanQuery,
  years: number[],
  dataPath: string,
  adrTable: string,
  metric: string,
  groupExpr: string,
  yearFilter: string,
  populationWhere: string,
  orderBy: string,
  limit: string,
  needsNationalTotal: boolean
): string {
  // For queries without HAS, we just show totals per year
  const yearColumns = years.map(year =>
    `SUM(CASE WHEN aar = ${year} THEN total ELSE 0 END) AS "${year}"`
  ).join(',\n    ');

  let sql: string;

  if (needsNationalTotal) {
    sql = `
WITH by_group AS (
  SELECT ${groupExpr} AS gruppe, aar, SUM(${metric}) AS total
  FROM ${adrTable}
  WHERE ${yearFilter}${populationWhere ? ` AND ${populationWhere}` : ''}
  GROUP BY ${groupExpr}, aar
),
with_national AS (
  SELECT * FROM by_group
  UNION ALL
  SELECT 'Norge' AS gruppe, aar, SUM(total) AS total
  FROM by_group
  GROUP BY aar
)
SELECT
    gruppe,
    ${yearColumns}
FROM with_national
GROUP BY gruppe
ORDER BY CASE WHEN gruppe = 'Norge' THEN 1 ELSE 0 END, gruppe ASC
${limit}`.trim();
  } else {
    sql = `
WITH by_group AS (
  SELECT ${groupExpr} AS gruppe, aar, SUM(${metric}) AS total
  FROM ${adrTable}
  WHERE ${yearFilter}${populationWhere ? ` AND ${populationWhere}` : ''}
  GROUP BY ${groupExpr}, aar
)
SELECT
    gruppe,
    ${yearColumns}
FROM by_group
GROUP BY gruppe
${orderBy}
${limit}`.trim();
  }

  return sql;
}

function buildPivotOrderBy(sort: { field: string; dir: string }, grouping: Grouping): string {
  // For pivot queries, we can only sort by group since years are columns
  return `ORDER BY gruppe ${sort.dir}`;
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

function buildCoverageCondition(has: HasClause | null): string | null {
  if (!has) {
    return null;
  }

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

  // Filter out subscription-only filters (privat/bedrift)
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
        // Case-insensitive matching for fylke og kommune
        if (filter.field === 'fylke' || filter.field === 'kom') {
          return `UPPER(${sqlField}) ${filter.op} UPPER('${value}')`;
        }
        return `${sqlField} ${filter.op} '${value}'`;
      }
      return `${sqlField} ${filter.op} ${value}`;
    }
  });

  return conditions.join(' AND ');
}

function buildCoverageSubquery(has: HasClause | null, dekningTable: string, yearFilter: string, sourceFilter: string | null): string | null {
  if (!has) {
    return null;
  }

  const sourceCondition = sourceFilter ? ` AND ${sourceFilter}` : '';

  if (has.quantified) {
    const { quantifier, expressions } = has.quantified;

    if (quantifier === 'ANY') {
      // ANY: OR of all conditions
      const conditions = expressions.map(expr => expressionToSql(expr)).join(' OR ');
      return `SELECT DISTINCT adrid FROM ${dekningTable} WHERE ${yearFilter}${sourceCondition} AND (${conditions})`;
    }

    if (quantifier === 'ALL') {
      // ALL: INTERSECT of separate queries
      const subqueries = expressions.map(expr => {
        const condition = expressionToSql(expr);
        return `SELECT DISTINCT adrid FROM ${dekningTable} WHERE ${yearFilter}${sourceCondition} AND ${condition}`;
      });
      return subqueries.join('\n    INTERSECT\n    ');
    }

    if (quantifier === 'NONE') {
      // NONE: NOT IN (any matching)
      const conditions = expressions.map(expr => expressionToSql(expr)).join(' OR ');
      return `SELECT DISTINCT adrid FROM ${dekningTable} WHERE ${yearFilter}${sourceCondition} AND adrid NOT IN (
        SELECT adrid FROM ${dekningTable} WHERE ${yearFilter}${sourceCondition} AND (${conditions})
      )`;
    }
  }

  if (has.expression) {
    const condition = expressionToSql(has.expression);
    return `SELECT DISTINCT adrid FROM ${dekningTable} WHERE ${yearFilter}${sourceCondition} AND ${condition}`;
  }

  throw new CodeGenError('HAS clause must have either quantified or expression');
}

// Correlated subquery for multi-year: uses d.aar = a.aar to match year per row
function buildCoverageSubqueryForPivot(has: HasClause | null, dekningTable: string, sourceFilter: string | null): string | null {
  if (!has) {
    return null;
  }

  const yearCorrelation = 'd.aar = a.aar';
  const sourceCondition = sourceFilter ? ` AND ${sourceFilter}` : '';

  if (has.quantified) {
    const { quantifier, expressions } = has.quantified;

    if (quantifier === 'ANY') {
      const conditions = expressions.map(expr => expressionToSql(expr)).join(' OR ');
      return `SELECT DISTINCT adrid FROM ${dekningTable} d WHERE ${yearCorrelation}${sourceCondition} AND (${conditions})`;
    }

    if (quantifier === 'ALL') {
      const subqueries = expressions.map(expr => {
        const condition = expressionToSql(expr);
        return `SELECT DISTINCT adrid FROM ${dekningTable} d WHERE ${yearCorrelation}${sourceCondition} AND ${condition}`;
      });
      return subqueries.join('\n    INTERSECT\n    ');
    }

    if (quantifier === 'NONE') {
      const conditions = expressions.map(expr => expressionToSql(expr)).join(' OR ');
      return `SELECT DISTINCT adrid FROM ${dekningTable} d WHERE ${yearCorrelation}${sourceCondition} AND adrid NOT IN (
        SELECT adrid FROM ${dekningTable} WHERE aar = a.aar${sourceCondition} AND (${conditions})
      )`;
    }
  }

  if (has.expression) {
    const condition = expressionToSql(has.expression);
    return `SELECT DISTINCT adrid FROM ${dekningTable} d WHERE ${yearCorrelation}${sourceCondition} AND ${condition}`;
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
