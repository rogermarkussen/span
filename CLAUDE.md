# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Span** is a domain-specific query language (DSL) for analyzing Norwegian telecommunications coverage data. The DSL is fully implemented with parser, lexer, and SQL code generator.

The DSL translates natural-language-like queries into SQL for DuckDB execution against parquet files containing address-level coverage data.

## Repository Structure

```
span/
├── src/                # DSL implementation
│   ├── lexer/          # Tokenizer
│   ├── parser/         # AST parser
│   └── codegen/        # SQL generator
├── tests/              # Vitest tests
├── DSL.md              # Complete language specification with EBNF grammar
├── DSL-doc.md          # Norwegian user documentation
├── FILEORG.md          # Data transformation logic and Azure architecture
├── data/               # Parquet data files
│   ├── span_adr.parquet    # Address data (all years)
│   ├── span_dekning.parquet # Coverage data (all years)
│   └── span_ab.parquet     # Subscription data (all years)
└── reference/
    ├── DATA_DICT.md    # Column definitions for all parquet files
    └── DEKNING.md      # Historical coverage data documentation
```

## Span DSL Syntax

Basic query structure:
```
HAS <coverage-conditions>    -- Required: fiber, kabel, dsl, 5g, 4g, ftb, nedhast >= N
[IN <population-filters>]    -- Optional: fylke, kom, tett, spredt, type, private, business
COUNT <metric>               -- Required: hus, adr, fritid, ab
[BY <grouping>]              -- Optional: total, fylke, kom, postnr, tett, tilb, tek
[SHOW <output>]              -- Optional: count, andel, begge
[SORT <field> ASC|DESC]      -- Optional: count, andel, group
[TOP <n>]                    -- Optional: limit rows
[FOR <year>]                 -- Optional: 2024, (2023, 2024), ar >= 2022
```

Quantifiers for overlap queries: `ANY(...)`, `ALL(...)`, `NONE(...)`

**Note:** `COUNT ab` counts subscriptions from `span_ab.parquet`. Filters `private`/`business` are only valid with `COUNT ab`.

## Data Notes

- **Speed values in span_* files are stored in Mbps** (no conversion needed)
- **County changes in 2024**: 11 counties split into 15 (Viken→3, Vestfold og Telemark→2, Troms og Finnmark→2)
- All span_* parquet files contain an `aar` column for year filtering

## Key Column Names (in span_* parquet files)

| Column | Meaning |
|--------|---------|
| adrid | Address ID (primary key) |
| fylke | County name |
| komnavn | Municipality name |
| ertett | Boolean: urban (tettsted) vs rural |
| hus | Household count |
| fritid | Cabin count |
| tilb | Provider name |
| tek | Technology type |
| ned_mbps | Download speed (Mbps) |
| opp_mbps | Upload speed (Mbps) |
| aar | Year |
| privat | Boolean: private (true) vs business (false) - only in span_ab |

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
