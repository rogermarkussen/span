# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Span** is a domain-specific query language (DSL) for analyzing Norwegian telecommunications coverage data. This repository contains specifications, documentation, and parquet data files - no executable implementation code yet.

The DSL translates natural-language-like queries into SQL for DuckDB execution against parquet files containing address-level coverage data.

## Repository Structure

```
span/
├── DSL.md              # Complete language specification with EBNF grammar
├── DSL-doc.md          # Norwegian user documentation
├── FILEORG.md          # Data transformation logic and Azure architecture
├── data/               # Parquet data files (2022-2024)
│   ├── YYYY/           # Yearly directories with adr, fbb, mob, ab files
│   ├── dekning_tek.parquet   # Historical tech coverage (2013-2024)
│   └── dekning_hast.parquet  # Historical speed coverage (2010-2024)
└── reference/
    ├── DATA_DICT.md    # Column definitions for all parquet files
    └── DEKNING.md      # Historical coverage data documentation
```

## Span DSL Syntax

Basic query structure:
```
HAS <coverage-conditions>    -- Required: fiber, cable, dsl, 5g, 4g, fwa, speed >= N
[IN <population-filters>]    -- Optional: county, municipality, urban, rural, type
COUNT <metric>               -- Required: homes, addresses, buildings, cabins
[BY <grouping>]              -- Optional: national, county, municipality, postal, urban, provider, tech
[SHOW <output>]              -- Optional: count, percent, both
[SORT <field> ASC|DESC]      -- Optional: count, percent, group
[TOP <n>]                    -- Optional: limit rows
```

Quantifiers for overlap queries: `ANY(...)`, `ALL(...)`, `NONE(...)`

## Data Notes

- **Speed values in parquet files are stored in kbps** (not Mbps). Convert: 100 Mbps = 100000 kbps
- **Dekningsandel (coverage) values are 0-1**, multiply by 100 for percentage
- **mob.parquet only exists from 2023** (no mobile coverage data for 2022)
- **County changes in 2024**: 11 counties split into 15 (Viken→3, Vestfold og Telemark→2, Troms og Finnmark→2)
- Use adr file from same year as coverage data for correct county mapping

## Key Column Names (abbreviated in parquet)

| Column | Meaning |
|--------|---------|
| adrid | Address ID (primary key) |
| fylke | County name |
| komnavn | Municipality name |
| ertett | Boolean: urban (tettsted) vs rural |
| hus | Household count |
| tilb | Provider name |
| tek | Technology type |
| ned/opp | Download/upload speed (kbps) |

## Target Architecture

Server-side DuckDB in Azure Container App, not browser-side. The planned stack:
- **Backend**: Node.js + DuckDB (native compilation required: `apk add python3 make g++`)
- **Frontend**: React
- **Storage**: Azure Blob Storage (parquet files)
- **API**: POST /api/query (parameterized SQL), GET /api/pivot, /api/filters, /api/metadata

## SQL Generation Pattern

The DSL compiles to this SQL template:
```sql
WITH population AS (
  SELECT {grouping} AS gruppe, SUM({metric}) AS total
  FROM adr WHERE {population_filters} GROUP BY {grouping}
),
coverage AS (
  SELECT a.{grouping} AS gruppe, SUM(a.{metric}) AS covered
  FROM adr a WHERE a.adresse_id IN ({coverage_subquery}) AND {population_filters}
  GROUP BY a.{grouping}
)
SELECT p.gruppe, COALESCE(c.covered, 0), p.total,
       ROUND(100.0 * COALESCE(c.covered, 0) / p.total, 1) AS percent
FROM population p LEFT JOIN coverage c USING (gruppe)
ORDER BY {sort_field} {sort_dir} {limit}
```

## DuckDB Query Examples

```sql
-- Read parquet with year-specific path
SELECT * FROM 'data/2024/adr.parquet' LIMIT 10

-- Coverage check pattern (EXISTS subquery)
SELECT a.fylke, SUM(a.hus) as covered
FROM 'data/2024/adr.parquet' a
WHERE EXISTS(SELECT 1 FROM 'data/2024/fbb.parquet' f
             WHERE f.adrid = a.adrid AND f.tek = 'fiber')
GROUP BY a.fylke
```
