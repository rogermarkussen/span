import { CoverageFlag, Metric, Grouping, PopulationFlag } from '../parser/ast.js';

// Technology mappings: DSL flag → SQL condition
export const TECH_MAPPINGS: Record<CoverageFlag, string> = {
  'fiber': "tek = 'fiber'",
  'cable': "tek = 'cable'",
  'dsl': "tek = 'dsl'",
  '5g': "tek = '5g'",
  '4g': "tek = '4g'",
  'fwa': "tek = 'fwa'"
};

// Metric mappings: DSL metric → SQL column
export const METRIC_MAPPINGS: Record<Metric, string> = {
  'homes': 'hus',
  'addresses': '1',  // COUNT(1) for addresses
  'buildings': 'bygninger',
  'cabins': 'fritid'
};

// Grouping mappings: DSL grouping → SQL expression
export const GROUPING_MAPPINGS: Record<Grouping, string> = {
  'national': "'Norge'",
  'county': 'fylke',
  'municipality': 'komnavn',
  'postal': 'postnr',
  'urban': "CASE WHEN ertett THEN 'Tettsted' ELSE 'Spredt' END",
  'provider': 'tilb',
  'tech': 'tek'
};

// Population filter mappings
export const POPULATION_MAPPINGS: Record<PopulationFlag, string> = {
  'urban': 'ertett = true',
  'rural': 'ertett = false'
};

// Field mappings: DSL field → SQL column
export const FIELD_MAPPINGS: Record<string, string> = {
  'speed': 'ned',
  'upload': 'opp',
  'tech': 'tek',
  'provider': 'tilb',
  'county': 'fylke',
  'municipality': 'komnavn',
  'type': 'bygtype',
  'postal': 'postnr'
};

// Speed conversion: Mbps to kbps
export function convertSpeed(mbps: number): number {
  return mbps * 1000;
}

// Check if field is a speed field (needs conversion)
export function isSpeedField(field: string): boolean {
  return field === 'speed' || field === 'upload';
}
