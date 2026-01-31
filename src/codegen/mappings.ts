import { CoverageFlag, Metric, Grouping, PopulationFlag } from '../parser/ast.js';

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
  'private': 'privat = true',
  'business': 'privat = false'
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

// Speed conversion: no longer needed (span_* files have Mbps directly)
export function convertSpeed(mbps: number): number {
  return mbps;  // No conversion - span_* files store values in Mbps
}

// Check if field is a speed field (no conversion needed for span_* files)
export function isSpeedField(field: string): boolean {
  return field === 'nedhast' || field === 'opphast';
}
