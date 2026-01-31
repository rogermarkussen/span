# Span - A Query Language for Coverage Data

## Introduction

**Span** is a domain-specific query language designed for analyzing telecommunications coverage data. The name reflects the core question: *"What does coverage span?"*

### Design Goals

| Goal | Description |
|------|-------------|
| **Intuitive** | Reads like natural English |
| **Concise** | Short keywords, minimal boilerplate |
| **Deterministic** | Same query → same result, always |
| **Flexible** | Handles simple counts to complex overlaps |
| **Parseable** | Simple grammar, easy to implement |

---

## Language Overview

### Basic Structure

```
[HAS <coverage-conditions>]
[IN <population-filters>]
COUNT <metric>
[BY <grouping>]
[SHOW <output>]
[SORT <field> ASC|DESC]
[TOP <n>]
[FOR <year> | FOR (<year>, <year>, ...)]
```

### Minimal Example

```
HAS fiber
COUNT hus
```
*"Count homes that have fiber coverage"*

### Queries Without HAS

When `HAS` is omitted, the query counts all addresses without any coverage filter:

```
COUNT hus BY fylke FOR 2024
```
*"Count all homes by county for 2024"*

```
COUNT ab BY fylke FOR 2024
```
*"Count all subscriptions by county for 2024"*

### Full Example

```
HAS fiber AND nedhast >= 100
IN tett
COUNT hus
BY fylke
SHOW andel
SORT andel DESC
TOP 10
```
*"Top 10 counties by percentage of urban homes with 100+ Mbps fiber"*

---

## Keywords

### Core Keywords

| Keyword | Purpose | Required | Description |
|---------|---------|----------|-------------|
| `HAS` | Coverage filter | No | What coverage criteria must be met? (Omit for "all") |
| `COUNT` | Metric | Yes | What are we counting? |

### Optional Keywords

| Keyword | Purpose | Default | Description |
|---------|---------|---------|-------------|
| `IN` | Population filter | All addresses | Which population to measure against? |
| `BY` | Grouping | National total | How to break down results? |
| `SHOW` | Output format | `both` | What to display? |
| `SORT` | Ordering | `group ASC` | How to order results? |
| `TOP` | Limit | No limit | Maximum rows to return? |
| `FOR` | Year filter | API default | Which year(s) to query? |

---

## Coverage Conditions (HAS)

### Fields

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `fiber` | flag | - | Has fiber coverage |
| `kabel` | flag | - | Has cable coverage |
| `dsl` | flag | - | Has DSL coverage |
| `5g` | flag | - | Has 5G coverage |
| `4g` | flag | - | Has 4G coverage |
| `ftb` | flag | - | Has Fixed Wireless Access |
| `tek` | string | Fiber, Kabel, DSL, 5G, 4G, FTB | Technology type |
| `nedhast` | number | Mbps | Download speed |
| `opphast` | number | Mbps | Upload speed |
| `tilb` | string | Telenor, Telia, Ice, ... | Service provider |

### Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `=` | Equals | `tek = Fiber` |
| `!=` | Not equals | `tilb != Telenor` |
| `>=` | Greater or equal | `nedhast >= 100` |
| `<=` | Less or equal | `nedhast <= 30` |
| `>` | Greater than | `nedhast > 50` |
| `<` | Less than | `nedhast < 10` |

### Logical Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `AND` | Both conditions | `fiber AND nedhast >= 100` |
| `OR` | Either condition | `fiber OR cable` |
| `NOT` | Negation | `NOT dsl` |

### Operator Precedence

| Priority | Operator | Description |
|----------|----------|-------------|
| 1 (highest) | `NOT` | Negation |
| 2 | `AND` | Conjunction |
| 3 (lowest) | `OR` | Disjunction |

### Parentheses

Use parentheses to override precedence or group complex expressions:

```
HAS (fiber AND nedhast >= 100) OR (5g AND nedhast >= 50)
HAS NOT (fiber OR kabel)
```

### Quantifiers

Quantifiers specify how conditions should match against addresses with multiple coverage offers:

| Quantifier | Meaning | SQL Mapping |
|------------|---------|-------------|
| `ANY(...)` | At least one matches (default) | EXISTS |
| `ALL(...)` | All must match | INTERSECT / HAVING COUNT |
| `NONE(...)` | None match | NOT EXISTS |

#### Examples

```
HAS ANY(fiber, kabel)           -- Has fiber OR cable
HAS ALL(fiber, kabel)           -- Has BOTH fiber AND cable
HAS NONE(nedhast >= 30)         -- No offer with speed >= 30
HAS ALL(tilb IN (Telenor, Telia))  -- Covered by both Telenor and Telia
```

**Note:** When no quantifier is specified, `ANY` is assumed (backwards compatible).

---

## Population Filters (IN)

### Fields

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `fylke` | string | Oslo, Rogaland, ... | County name |
| `kom` | string | Bergen, Trondheim, ... | Municipality name |
| `tett` | flag | - | Urban areas only |
| `spredt` | flag | - | Rural areas only |
| `type` | string | house, apartment, cabin | Building type |
| `postnr` | string | 0001-9999 | Postal code |
| `privat` | flag | - | Private ab only* |
| `bedrift` | flag | - | Business ab only* |

\* Only available with `COUNT ab`

### Examples

```
IN fylke = Oslo
IN tett
IN type = cabin
IN fylke = Rogaland AND tett
IN privat                      -- Only for COUNT ab
```

---

## Metrics (COUNT)

| Metric | SQL Column | Description |
|--------|------------|-------------|
| `hus` | hus | Number of households |
| `adr` | COUNT(adrid) | Number of addresses |
| `fritid` | fritid | Number of cabins/vacation homes |
| `ab` | COUNT(*) | Number of subscriptions |

### Subscriptions

`COUNT ab` counts actual subscriptions from the subscription dataset (`span_ab.parquet`), as opposed to other metrics which count potential coverage opportunities.

**Note:** For subscriptions, you can use special filters:
- `IN privat` - Private customer subscriptions only
- `IN bedrift` - Business subscriptions only

These filters are **only** available with `COUNT ab`.

---

## Grouping (BY)

| Level | Description |
|-------|-------------|
| `total` | Single national total (default) |
| `fylke` | Per county (11 rows) |
| `kom` | Per municipality (~356 rows) |
| `postnr` | Per postal code |
| `tett` | Urban vs rural (2 rows) |
| `tilb` | Per service provider |
| `tek` | Per technology |

---

## Output Format (SHOW)

| Format | Description |
|--------|-------------|
| `count` | Only show count with coverage |
| `andel` | Only show percentage |
| `begge` | Show count, total, and percentage (default) |

---

## Data Source

Span queries can target different data sources. The data source determines which coverage dataset is queried.

| Source | Description |
|--------|-------------|
| `fbb` | Fixed broadband coverage (default) |
| `mob` | Mobile coverage |
| `begge` | Both fixed and mobile coverage |

When no data source is specified, `fbb` (fixed broadband) is used as the default.

**Note:** Data source selection is currently handled internally and may be exposed in the query syntax in future versions.

---

## Multi-Query

Multiple queries can be combined with the `---` separator:

```
HAS nedhast >= 1000
COUNT hus
---
HAS nedhast >= 100 AND nedhast < 1000
COUNT hus
---
HAS nedhast < 100
COUNT hus
```

The API returns an array with results for each query.

---

## Data Handling

### NULL Values
- Groups without addresses are not shown in output
- Missing speed values are excluded from speed filters
- Percent is calculated as `NULL` if total = 0

### Rounding
- Percentages are rounded to 1 decimal place
- Whole numbers are displayed without decimals

---

## Examples

### Example 1: National Fiber Coverage
*"What percentage of homes have fiber?"*

```
HAS fiber
COUNT hus
```

**Output:**
| hus_covered | total_hus | andel |
|-------------|-----------|-------|
| 1,850,000 | 2,400,000 | 77.1% |

---

### Example 2: Fiber Coverage by County
*"Fiber coverage percentage by county"*

```
HAS fiber
COUNT hus
BY fylke
SHOW andel
SORT andel DESC
```

**Output:**
| fylke | andel |
|-------|-------|
| Oslo | 89.2% |
| Rogaland | 82.1% |
| Vestland | 78.4% |
| ... | ... |

---

### Example 3: High-Speed Coverage in Urban Areas
*"Homes in urban areas with 100+ Mbps"*

```
HAS nedhast >= 100
IN tett
COUNT hus
BY fylke
```

---

### Example 4: Cabin Coverage
*"What percentage of cabins have any broadband?"*

```
HAS fiber OR kabel OR dsl OR ftb
COUNT fritid
SHOW andel
```

---

### Example 5: Overlap - Both Fiber and 5G
*"Addresses that have BOTH fiber and 5G coverage"*

```
HAS ALL(fiber, 5g)
COUNT adr
BY fylke
```

---

### Example 6: Provider Comparison
*"Fiber coverage by provider, top 5"*

```
HAS fiber
COUNT hus
BY tilb
SORT count DESC
TOP 5
```

---

### Example 7: Speed Tiers
*"Distribution of speed tiers nationally"*

```
HAS nedhast >= 1000
COUNT hus
---
HAS nedhast >= 100 AND nedhast < 1000
COUNT hus
---
HAS nedhast >= 30 AND nedhast < 100
COUNT hus
---
HAS nedhast < 30
COUNT hus
```

---

### Example 8: Rural 5G
*"5G coverage in rural areas by county"*

```
HAS 5g
IN spredt
COUNT hus
BY fylke
SHOW andel
SORT andel DESC
TOP 10
```

---

### Example 9: Multi-Provider Coverage
*"Addresses with coverage from both Telenor and Telia"*

```
HAS ALL(tilb IN (Telenor, Telia))
COUNT adr
SHOW andel
```

---

### Example 10: Underserved Areas
*"Homes without any high-speed option"*

```
HAS NONE(nedhast >= 30)
COUNT hus
BY fylke
SORT count DESC
```

---

### Example 11: Year-Specific Query
*"Fiber coverage in 2024"*

```
HAS fiber
COUNT hus
BY fylke
FOR 2024
```

---

### Example 12: Multi-Year Comparison
*"Fiber coverage across 2023 and 2024"*

```
HAS fiber
COUNT hus
BY fylke
FOR (2023, 2024)
```

Results include a `aar` column for year when multiple years are specified.

---

### Example 13: Private Fiber Subscriptions
*"Private fiber subscriptions by county"*

```
HAS fiber
IN privat
COUNT ab
BY fylke
FOR 2024
```

---

### Example 14: Business High-Speed Subscriptions
*"Business subscriptions with 100+ Mbps by provider"*

```
HAS nedhast >= 100
IN bedrift
COUNT ab
BY tilb
SORT count DESC
TOP 10
FOR 2024
```

---

## Grammar Specification

### EBNF

```ebnf
queries     = query { "---" query }

query       = [has_clause] [in_clause] count_clause [by_clause]
              [show_clause] [sort_clause] [top_clause] [for_clause]

has_clause  = "HAS" [quantifier] coverage_condition { ("AND" | "OR") coverage_condition }
quantifier  = "ANY" | "ALL" | "NONE"
coverage_condition = ["NOT"] ( coverage_flag | coverage_comparison | "(" coverage_condition { ("AND" | "OR") coverage_condition } ")" )
coverage_flag = "fiber" | "kabel" | "dsl" | "5g" | "4g" | "ftb"
coverage_comparison = coverage_field operator value
coverage_field = "tek" | "nedhast" | "opphast" | "tilb"

in_clause   = "IN" population_condition { ("AND" | "OR") population_condition }
population_condition = ["NOT"] ( population_flag | population_comparison )
population_flag = "tett" | "spredt" | "privat" | "bedrift"
population_comparison = population_field operator value
population_field = "fylke" | "kom" | "type" | "postnr"

operator    = "=" | "!=" | ">=" | "<=" | ">" | "<"
value       = string | number | value_list
value_list  = "(" value { "," value } ")"
string      = word | "'" { any_char } "'"
number      = digit { digit }

count_clause = "COUNT" metric
metric      = "hus" | "adr" | "fritid" | "ab"

by_clause   = "BY" grouping
grouping    = "total" | "fylke" | "kom" | "postnr" | "tett" | "tilb" | "tek"

show_clause = "SHOW" output
output      = "count" | "andel" | "begge"

sort_clause = "SORT" sort_field sort_dir
sort_field  = "count" | "andel" | "group"
sort_dir    = "ASC" | "DESC"

top_clause  = "TOP" number

for_clause  = "FOR" ( year_value | year_comparison )
year_value  = number | "(" number { "," number } ")"
year_comparison = "ar" operator number
```

---

## Parser Implementation

### Tokenizer

```javascript
const TOKEN_TYPES = {
  KEYWORD: /^(HAS|IN|COUNT|BY|SHOW|SORT|TOP|AND|OR|NOT|ANY|ALL|NONE|FOR)$/i,
  COVERAGE_FLAG: /^(fiber|kabel|dsl|5g|4g|ftb)$/i,
  POPULATION_FLAG: /^(tett|spredt|privat|bedrift)$/i,
  COVERAGE_FIELD: /^(tek|nedhast|opphast|tilb)$/i,
  POPULATION_FIELD: /^(fylke|kom|type|postnr)$/i,
  METRIC: /^(hus|adr|fritid|ab)$/i,
  GROUPING: /^(total|fylke|kom|postnr|tett|tilb|tek)$/i,
  OUTPUT: /^(count|andel|begge)$/i,
  OPERATOR: /^(=|!=|>=|<=|>|<)$/,
  NUMBER: /^\d+$/,
  STRING: /^'[^']*'$|^[A-Za-zÆØÅæøå][A-Za-zÆØÅæøå0-9]*$/
};

function tokenize(query) {
  // Split on whitespace, preserve quoted strings
  const regex = /'[^']*'|\S+/g;
  return query.match(regex).map(token => ({
    value: token,
    type: getTokenType(token)
  }));
}
```

### Parser (Recursive Descent)

```javascript
class SpanParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  parse() {
    const ast = {
      has: this.parseHas(),
      in: null,
      count: null,
      by: 'total',
      show: 'begge',
      sort: { field: 'group', dir: 'ASC' },
      top: null
    };

    while (this.pos < this.tokens.length) {
      const token = this.current();
      switch (token.value.toUpperCase()) {
        case 'IN': ast.in = this.parseIn(); break;
        case 'COUNT': ast.count = this.parseCount(); break;
        case 'BY': ast.by = this.parseBy(); break;
        case 'SHOW': ast.show = this.parseShow(); break;
        case 'SORT': ast.sort = this.parseSort(); break;
        case 'TOP': ast.top = this.parseTop(); break;
      }
    }

    return ast;
  }

  parseHas() {
    this.expect('HAS');
    return this.parseConditions();
  }

  parseConditions() {
    const conditions = [];
    let operator = 'AND';

    while (this.pos < this.tokens.length) {
      const token = this.current();

      if (token.type === 'KEYWORD' && !['AND', 'OR', 'NOT'].includes(token.value.toUpperCase())) {
        break;
      }

      if (token.value.toUpperCase() === 'AND') {
        operator = 'AND';
        this.advance();
        continue;
      }

      if (token.value.toUpperCase() === 'OR') {
        operator = 'OR';
        this.advance();
        continue;
      }

      const condition = this.parseCondition();
      conditions.push({ ...condition, operator });
    }

    return conditions;
  }

  parseCondition() {
    let negated = false;
    if (this.current().value.toUpperCase() === 'NOT') {
      negated = true;
      this.advance();
    }

    const token = this.current();

    // Coverage flag (fiber, cable, etc.) or population flag (urban, rural)
    if (token.type === 'COVERAGE_FLAG' || token.type === 'POPULATION_FLAG') {
      this.advance();
      return { type: 'flag', flag: token.value.toLowerCase(), negated };
    }

    // Comparison (speed >= 100)
    const field = this.advance().value.toLowerCase();
    const op = this.advance().value;
    let value = this.advance().value;

    // Remove quotes from strings
    if (value.startsWith("'")) {
      value = value.slice(1, -1);
    } else if (/^\d+$/.test(value)) {
      value = parseInt(value, 10);
    }

    return { type: 'comparison', field, op, value, negated };
  }

  // ... remaining parse methods
}
```

---

## SQL Generation

### Core Logic

The SQL generation follows a consistent pattern:

1. **Population CTE**: Calculate the denominator from address data
2. **Coverage CTE**: Calculate the numerator (addresses with coverage)
3. **Final SELECT**: Join and compute percentages

### Template

```sql
WITH population AS (
  SELECT {grouping} AS gruppe, SUM({metric}) AS total
  FROM adr
  {population_where}
  GROUP BY {grouping}
),
coverage AS (
  SELECT a.{grouping} AS gruppe, SUM(a.{metric}) AS covered
  FROM adr a
  WHERE a.adresse_id IN ({coverage_subquery})
  {population_where}
  GROUP BY a.{grouping}
)
SELECT
  p.gruppe,
  COALESCE(c.covered, 0) AS covered,
  p.total,
  ROUND(100.0 * COALESCE(c.covered, 0) / p.total, 1) AS percent
FROM population p
LEFT JOIN coverage c USING (gruppe)
ORDER BY {sort_field} {sort_dir}
{limit}
```

### Quantifier SQL Mapping

**ANY (default):**
```sql
-- HAS ANY(fiber, cable)
WHERE a.adresse_id IN (
  SELECT adresse_id FROM fbb WHERE tech = 'Fiber' OR tech = 'Cable'
)
```

**ALL:**
```sql
-- HAS ALL(fiber, cable)
WHERE a.adresse_id IN (
  SELECT adresse_id FROM fbb
  WHERE tech IN ('Fiber', 'Cable')
  GROUP BY adresse_id
  HAVING COUNT(DISTINCT tech) = 2
)

-- Alternative with INTERSECT:
WHERE a.adresse_id IN (
  SELECT adresse_id FROM fbb WHERE tech = 'Fiber'
  INTERSECT
  SELECT adresse_id FROM fbb WHERE tech = 'Cable'
)
```

**NONE:**
```sql
-- HAS NONE(speed >= 30)
WHERE a.adresse_id NOT IN (
  SELECT adresse_id FROM fbb WHERE speed >= 30
)
```

---

## API Design

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/span` | Execute a query |
| `POST` | `/api/span/parse` | Parse and validate (no execution) |
| `GET` | `/api/span/schema` | Get language schema |

### Request

```json
{
  "query": "HAS fiber\nCOUNT homes\nBY county"
}
```

### Response

```json
{
  "success": true,
  "data": [
    { "gruppe": "Oslo", "covered": 245000, "total": 275000, "percent": 89.1 },
    { "gruppe": "Rogaland", "covered": 180000, "total": 220000, "percent": 81.8 }
  ],
  "meta": {
    "query": "HAS fiber\nCOUNT homes\nBY county",
    "ast": { ... },
    "sql": "WITH population AS ...",
    "executionTimeMs": 42
  }
}
```

---

## Error Messages

Good error messages are critical for usability:

```
Error: Unknown keyword 'HAVING' at position 1
  HAS fiber HAVING speed >= 100
            ^^^^^^
  Did you mean 'AND'?

Error: Unknown field 'bandwidth' at position 1
  HAS bandwidth >= 100
      ^^^^^^^^^
  Available fields: speed, upload, tech, provider

Error: Missing required COUNT clause
  HAS fiber
  BY county
  ^^^^^^^^^
  Query must include COUNT (e.g., COUNT homes)
```

---

## Name Alternatives Considered

| Name | Pros | Cons |
|------|------|------|
| **Span** | Short, descriptive, verb-like | Common word |
| **Reach** | Intuitive, short | Common word |
| **Cov** | Very short | Sounds truncated |
| **NetQL** | Clear purpose | Generic |
| **TelQ** | Telecom-specific | Sounds like "tell" |

**Winner: Span** - It reads naturally: *"What does fiber span?"*

---

## Implementation Complexity

| Component | Lines of Code | Complexity |
|-----------|---------------|------------|
| Tokenizer | ~60 | Low |
| Parser | ~250 | Medium |
| SQL Generator | ~350 | Medium |
| Error Handler | ~100 | Low |
| API Layer | ~100 | Low |
| **Total** | **~860** | **Medium** |

---

## Future Extensions

### Phase 2: Time Comparison
```
HAS fiber
COUNT homes
BY county
COMPARE 2022 TO 2024
```

### Phase 3: Multiple Queries
```
HAS fiber COUNT homes AS fiber_homes
HAS cable COUNT homes AS cable_homes
COMBINE
```

### Phase 4: Calculated Fields
```
HAS fiber
COUNT homes
BY county
CALC growth = (current - previous) / previous * 100
```

---

## Conclusion

**Span** provides a clean, intuitive query language for coverage data:

- **8 keywords** to learn: HAS, IN, COUNT, BY, SHOW, SORT, TOP, FOR
- **3 quantifiers** for overlap: ANY, ALL, NONE
- **Reads like English**: "Has fiber, count homes, by county"
- **Handles complexity**: Overlaps, filters, groupings
- **Deterministic**: Same query → same result
- **Parseable**: ~800 lines of code

The language is flexible enough for almost any coverage question while remaining simple enough to parse correctly.
