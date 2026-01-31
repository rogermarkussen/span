import { CoverageFlag, Metric, Grouping, PopulationFlag, DataSource } from '../parser/ast.js';

// Technology mappings: DSL flag → SQL condition
export const TECH_MAPPINGS: Record<CoverageFlag, string> = {
  'fiber': "tek = 'fiber'",
  'kabel': "tek = 'cable'",
  'dsl': "tek = 'dsl'",
  '5g': "tek = '5g'",
  '4g': "tek = '4g'",
  'ftb': "tek = 'fwa'"
};

// Metric mappings: DSL metric → SQL column
export const METRIC_MAPPINGS: Record<Metric, string> = {
  'hus': 'hus',
  'adr': '1',  // COUNT(1) for addresses
  'fritid': 'fritid',
  'ab': '1'  // COUNT(1) for subscription rows
};

// Grouping mappings: DSL grouping → SQL expression
export const GROUPING_MAPPINGS: Record<Grouping, string> = {
  'total': "'Norge'",
  'fylke': 'fylke',
  'kom': 'komnavn',
  'postnr': 'postnr',
  'tett': "CASE WHEN ertett THEN 'Tettsted' ELSE 'Spredt' END",
  'tilb': 'tilb',
  'tek': 'tek'
};

// Population filter mappings
export const POPULATION_MAPPINGS: Record<PopulationFlag, string> = {
  'tett': 'ertett = true',
  'spredt': 'ertett = false',
  'privat': 'privat = true',
  'bedrift': 'privat = false'
};

// Field mappings: DSL field → SQL column
export const FIELD_MAPPINGS: Record<string, string> = {
  'nedhast': 'ned_mbps',
  'opphast': 'opp_mbps',
  'tek': 'tek',
  'tilb': 'tilb',
  'fylke': 'fylke',
  'kom': 'komnavn',
  'type': 'bygtype',
  'postnr': 'postnr'
};

// Data source filter: source → SQL condition (or null for no filter)
export const DATA_SOURCE_FILTERS: Record<DataSource, string | null> = {
  'fbb': "tek NOT IN ('4g', '5g')",
  'mob': "tek IN ('4g', '5g')",
  'begge': null
};

// Speed conversion: no longer needed (span_* files have Mbps directly)
export function convertSpeed(mbps: number): number {
  return mbps;  // No conversion - span_* files store values in Mbps
}

// Check if field is a speed field (no conversion needed for span_* files)
export function isSpeedField(field: string): boolean {
  return field === 'nedhast' || field === 'opphast';
}

// === Historikk-konstanter ===

// Teknologier som finnes i historikk.parquet
export const HISTORIKK_TECHNOLOGIES = [
  'fiber', 'kabel', 'dsl', '4g', '5g', 'ftb', 'radio', 'satellitt'
] as const;

// Hastighets-terskler som finnes i historikk.parquet (ned-verdier i Mbps)
export const HISTORIKK_SPEED_THRESHOLDS = [10, 30, 50, 100, 1000] as const;

// Geo-verdier i historikk.parquet
export const HISTORIKK_GEO_VALUES = ['totalt', 'tettbygd', 'spredtbygd'] as const;

// År hvor vi må bruke historikk.parquet (før adresse-nivå data)
export const HISTORIKK_CUTOFF_YEAR = 2022;

// Mapping fra Span Query teknologi til historikk indikator
export const HISTORIKK_TECH_MAPPINGS: Record<string, string> = {
  'fiber': 'fiber',
  'kabel': 'kabel',
  'dsl': 'dsl',
  '4g': '4g',
  '5g': '5g',
  'ftb': 'ftb',
  'radio': 'radio',
  'satellitt': 'satellitt'
};

// Mapping fra Span Query geo til historikk geo
export const HISTORIKK_GEO_MAPPINGS: Record<string, string> = {
  'total': 'totalt',
  'tett': 'tettbygd',
  'spredt': 'spredtbygd'
};

// Støttede grupperinger for historikk-data
export const HISTORIKK_SUPPORTED_GROUPINGS = ['total', 'tett'] as const;

// Sjekk om en hastighetsterskel er støttet i historikk
export function isHistorikkSpeedSupported(mbps: number): boolean {
  return (HISTORIKK_SPEED_THRESHOLDS as readonly number[]).includes(mbps);
}

// Sjekk om en teknologi er støttet i historikk
export function isHistorikkTechSupported(tech: string): boolean {
  return (HISTORIKK_TECHNOLOGIES as readonly string[]).includes(tech);
}

// Bygg historikk-indikator for hastighet
export function buildHistorikkSpeedIndicator(nedMbps: number, oppMbps?: number): string {
  if (oppMbps !== undefined && oppMbps > 0) {
    return `ned>=${nedMbps},opp>=${oppMbps}`;
  }
  return `ned>=${nedMbps}`;
}
