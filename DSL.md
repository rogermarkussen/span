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
COUNT homes
```
*"Count homes that have fiber coverage"*

### Queries Without HAS

When `HAS` is omitted, the query counts all addresses without any coverage filter:

```
COUNT homes BY county FOR 2024
```
*"Count all homes by county for 2024"*

```
COUNT ab BY county FOR 2024
```
*"Count all subscriptions by county for 2024"*

### Full Example

```
HAS fiber AND speed >= 100
IN urban
COUNT homes
BY county
SHOW percent
SORT percent DESC
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
| `SORT` | Ordering | `percent DESC` | How to order results? |
| `TOP` | Limit | No limit | Maximum rows to return? |
| `FOR` | Year filter | API default | Which year(s) to query? |

---

## Coverage Conditions (HAS)

### Fields

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `fiber` | flag | - | Has fiber coverage |
| `cable` | flag | - | Has cable coverage |
| `dsl` | flag | - | Has DSL coverage |
| `5g` | flag | - | Has 5G coverage |
| `4g` | flag | - | Has 4G coverage |
| `fwa` | flag | - | Has Fixed Wireless Access |
| `tech` | string | Fiber, Cable, DSL, 5G, 4G, FWA | Technology type |
| `speed` | number | Mbps | Download speed |
| `upload` | number | Mbps | Upload speed |
| `provider` | string | Telenor, Telia, Ice, ... | Service provider |

### Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `=` | Equals | `tech = Fiber` |
| `!=` | Not equals | `provider != Telenor` |
| `>=` | Greater or equal | `speed >= 100` |
| `<=` | Less or equal | `speed <= 30` |
| `>` | Greater than | `speed > 50` |
| `<` | Less than | `speed < 10` |
| `IN` | In list | `provider IN (Telenor, Telia)` |

### Logical Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `AND` | Both conditions | `fiber AND speed >= 100` |
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
HAS (fiber AND speed >= 100) OR (5g AND speed >= 50)
HAS NOT (fiber OR cable)
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
HAS ANY(fiber, cable)           -- Has fiber OR cable
HAS ALL(fiber, cable)           -- Has BOTH fiber AND cable
HAS NONE(speed >= 30)           -- No offer with speed >= 30
HAS ALL(provider IN (Telenor, Telia))  -- Covered by both Telenor and Telia
```

**Note:** When no quantifier is specified, `ANY` is assumed (backwards compatible).

---

## Population Filters (IN)

### Fields

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `county` | string | Oslo, Rogaland, ... | County name |
| `municipality` | string | Bergen, Trondheim, ... | Municipality name |
| `urban` | flag | - | Urban areas only |
| `rural` | flag | - | Rural areas only |
| `type` | string | house, apartment, cabin | Building type |
| `postal` | string | 0001-9999 | Postal code |
| `private` | flag | - | Private ab only* |
| `business` | flag | - | Business ab only* |

\* Only available with `COUNT ab`

### Examples

```
IN county = Oslo
IN urban
IN type = cabin
IN county = Rogaland AND urban
IN private                     -- Only for COUNT ab
```

---

## Metrics (COUNT)

| Metric | SQL Column | Description |
|--------|------------|-------------|
| `homes` | antall_husstander | Number of households |
| `addresses` | COUNT(adresse_id) | Number of addresses |
| `buildings` | COUNT(DISTINCT bygning_id) | Number of buildings |
| `cabins` | antall_fritidsboliger | Number of cabins/vacation homes |
| `ab` | COUNT(*) | Number of ab |

### Subscriptions

`COUNT ab` counts actual ab from the subscription dataset (`span_ab.parquet`), as opposed to other metrics which count potential coverage opportunities.

**Note:** For ab, you can use special filters:
- `IN private` - Private customer ab only
- `IN business` - Business ab only

These filters are **only** available with `COUNT ab`.

---

## Grouping (BY)

| Level | Description |
|-------|-------------|
| `national` | Single national total (default) |
| `county` | Per county (11 rows) |
| `municipality` | Per municipality (~356 rows) |
| `postal` | Per postal code |
| `urban` | Urban vs rural (2 rows) |
| `provider` | Per service provider |
| `tech` | Per technology |

---

## Output Format (SHOW)

| Format | Description |
|--------|-------------|
| `count` | Only show count with coverage |
| `percent` | Only show percentage |
| `both` | Show count, total, and percentage (default) |

---

## Multi-Query

Multiple queries can be combined with the `---` separator:

```
HAS speed >= 1000
COUNT homes
---
HAS speed >= 100 AND speed < 1000
COUNT homes
---
HAS speed < 100
COUNT homes
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
COUNT homes
```

**Output:**
| homes_covered | total_homes | percent |
|---------------|-------------|---------|
| 1,850,000 | 2,400,000 | 77.1% |

---

### Example 2: Fiber Coverage by County
*"Fiber coverage percentage by county"*

```
HAS fiber
COUNT homes
BY county
SHOW percent
SORT percent DESC
```

**Output:**
| county | percent |
|--------|---------|
| Oslo | 89.2% |
| Rogaland | 82.1% |
| Vestland | 78.4% |
| ... | ... |

---

### Example 3: High-Speed Coverage in Urban Areas
*"Homes in urban areas with 100+ Mbps"*

```
HAS speed >= 100
IN urban
COUNT homes
BY county
```

---

### Example 4: Cabin Coverage
*"What percentage of cabins have any broadband?"*

```
HAS fiber OR cable OR dsl OR fwa
IN type = cabin
COUNT homes
SHOW percent
```

---

### Example 5: Overlap - Both Fiber and 5G
*"Addresses that have BOTH fiber and 5G coverage"*

```
HAS ALL(fiber, 5g)
COUNT addresses
BY county
```

---

### Example 6: Provider Comparison
*"Fiber coverage by provider, top 5"*

```
HAS fiber
COUNT homes
BY provider
SORT count DESC
TOP 5
```

---

### Example 7: Speed Tiers
*"Distribution of speed tiers nationally"*

```
HAS speed >= 1000
COUNT homes
---
HAS speed >= 100 AND speed < 1000
COUNT homes
---
HAS speed >= 30 AND speed < 100
COUNT homes
---
HAS speed < 30
COUNT homes
```

---

### Example 8: Rural 5G
*"5G coverage in rural areas by county"*

```
HAS 5g
IN rural
COUNT homes
BY county
SHOW percent
SORT percent DESC
TOP 10
```

---

### Example 9: Multi-Provider Coverage
*"Addresses with coverage from both Telenor and Telia"*

```
HAS ALL(provider IN (Telenor, Telia))
COUNT addresses
SHOW percent
```

---

### Example 10: Underserved Areas
*"Homes without any high-speed option"*

```
HAS NONE(speed >= 30)
COUNT homes
BY county
SORT count DESC
```

---

### Example 11: Year-Specific Query
*"Fiber coverage in 2024"*

```
HAS fiber
COUNT homes
BY county
FOR 2024
```

---

### Example 12: Multi-Year Comparison
*"Fiber coverage across 2023 and 2024"*

```
HAS fiber
COUNT homes
BY county
FOR (2023, 2024)
```

Results include a `aar` column for year when multiple years are specified.

---

### Example 13: Private Fiber Subscriptions
*"Private fiber ab by county"*

```
HAS fiber
IN private
COUNT ab
BY county
FOR 2024
```

---

### Example 14: Business High-Speed Subscriptions
*"Business ab with 100+ Mbps by provider"*

```
HAS speed >= 100
IN business
COUNT ab
BY provider
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
coverage_flag = "fiber" | "cable" | "dsl" | "5g" | "4g" | "fwa"
coverage_comparison = coverage_field operator value
coverage_field = "tech" | "speed" | "upload" | "provider"

in_clause   = "IN" population_condition { ("AND" | "OR") population_condition }
population_condition = ["NOT"] ( population_flag | population_comparison )
population_flag = "urban" | "rural" | "private" | "business"
population_comparison = population_field operator value
population_field = "county" | "municipality" | "type" | "postal"

operator    = "=" | "!=" | ">=" | "<=" | ">" | "<" | "IN"
value       = string | number | value_list
value_list  = "(" value { "," value } ")"
string      = word | "'" { any_char } "'"
number      = digit { digit }

count_clause = "COUNT" metric
metric      = "homes" | "addresses" | "buildings" | "cabins" | "ab"

by_clause   = "BY" grouping
grouping    = "national" | "county" | "municipality" | "postal" | "urban" | "provider" | "tech"

show_clause = "SHOW" output
output      = "count" | "percent" | "both"

sort_clause = "SORT" sort_field sort_dir
sort_field  = "count" | "percent" | "group"
sort_dir    = "ASC" | "DESC"

top_clause  = "TOP" number

for_clause  = "FOR" ( number | "(" number { "," number } ")" )
```

---

## Parser Implementation

### Tokenizer

```javascript
const TOKEN_TYPES = {
  KEYWORD: /^(HAS|IN|COUNT|BY|SHOW|SORT|TOP|AND|OR|NOT|ANY|ALL|NONE)$/i,
  COVERAGE_FLAG: /^(fiber|cable|dsl|5g|4g|fwa)$/i,
  POPULATION_FLAG: /^(urban|rural|private|business)$/i,
  COVERAGE_FIELD: /^(tech|speed|upload|provider)$/i,
  POPULATION_FIELD: /^(county|municipality|type|postal)$/i,
  METRIC: /^(homes|addresses|buildings|cabins|ab)$/i,
  GROUPING: /^(national|county|municipality|postal|urban|provider|tech)$/i,
  OUTPUT: /^(count|percent|both)$/i,
  OPERATOR: /^(=|!=|>=|<=|>|<|IN)$/,
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
      by: 'national',
      show: 'both',
      sort: { field: 'percent', dir: 'DESC' },
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
