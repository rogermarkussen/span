# FILEORG.md - Datatransformasjon og Azure-arkitektur

## Oversikt

Dette dokumentet beskriver transformasjon av dekningsdata til analytiske datastrukturer og Azure-arkitektur for Ekomstat-applikasjonen.

---

## Del 1: Datakilder

### Rådata per år (2022-2024)

Dekningsdata leveres årlig i tre separate filer per år:

| Fil | Beskrivelse |
|-----|-------------|
| `adr_YYYY.parquet` | Adressepunktdata med dekningsinfo |
| `fbb_YYYY.parquet` | Fast bredbåndsdekning |
| `mob_YYYY.parquet` | Mobildekning |

### Kolonnedefinisjoner - Adressedata (adr)

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| `adresse_id` | STRING | Unik adresseidentifikator |
| `kommunenr` | STRING | 4-sifret kommunenummer |
| `fylkenr` | STRING | 2-sifret fylkesnummer |
| `postnr` | STRING | 4-sifret postnummer |
| `poststed` | STRING | Poststedsnavn |
| `grunnkrets_id` | STRING | Grunnkretsidentifikator |
| `boligtype` | STRING | Boligtype (enebolig, leilighet, etc.) |
| `antall_husstander` | INTEGER | Antall husstander på adressen |

### Kolonnedefinisjoner - Fast bredbånd (fbb)

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| `adresse_id` | STRING | Kobling til adressedata |
| `tilbyder` | STRING | Bredbåndsleverandør |
| `teknologi` | STRING | Teknologitype (fiber, DSL, kabel, etc.) |
| `hastighet_ned` | INTEGER | Nedlastingshastighet (Mbps) |
| `hastighet_opp` | INTEGER | Opplastingshastighet (Mbps) |

### Kolonnedefinisjoner - Mobildekning (mob)

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| `adresse_id` | STRING | Kobling til adressedata |
| `tilbyder` | STRING | Mobiloperatør |
| `teknologi` | STRING | Nettverkstype (4G, 5G, etc.) |
| `signalstyrke` | STRING | Dekningskvalitet (god, middels, svak) |

---

## Del 2: Målstruktur

### dekning_fakta.parquet (Denormalisert faktatabell)

Én rad per adresse-år-teknologi-tilbyder kombinasjon for detaljert analyse.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| `aar` | INTEGER | Rapporteringsår (2022-2024) |
| `adresse_id` | STRING | Unik adresseidentifikator |
| `kommunenr` | STRING | 4-sifret kommunenummer |
| `kommunenavn` | STRING | Kommunenavn |
| `fylkenr` | STRING | 2-sifret fylkesnummer |
| `fylkenavn` | STRING | Fylkesnavn |
| `postnr` | STRING | Postnummer |
| `poststed` | STRING | Poststedsnavn |
| `grunnkrets_id` | STRING | Grunnkretsidentifikator |
| `boligtype` | STRING | Boligtype |
| `antall_husstander` | INTEGER | Antall husstander |
| `dekningstype` | STRING | 'fbb' eller 'mob' |
| `tilbyder` | STRING | Leverandør/operatør |
| `teknologi` | STRING | Teknologitype |
| `hastighet_ned` | INTEGER | Nedlastingshastighet (NULL for mobil) |
| `hastighet_opp` | INTEGER | Opplastingshastighet (NULL for mobil) |
| `signalstyrke` | STRING | Dekningskvalitet (NULL for fbb) |

### dekning_kube.parquet (Pre-aggregert kube)

Pre-aggregerte tall for rask pivot-analyse.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| `aar` | INTEGER | Rapporteringsår |
| `fylkenr` | STRING | Fylkesnummer |
| `fylkenavn` | STRING | Fylkesnavn |
| `kommunenr` | STRING | Kommunenummer |
| `kommunenavn` | STRING | Kommunenavn |
| `dekningstype` | STRING | 'fbb' eller 'mob' |
| `teknologi` | STRING | Teknologitype |
| `tilbyder` | STRING | Leverandør |
| `hastighetsklasse` | STRING | Hastighetsgruppe (fbb) |
| `signalstyrke` | STRING | Dekningskvalitet (mob) |
| `antall_adresser` | INTEGER | Antall unike adresser |
| `antall_husstander` | INTEGER | Sum husstander |
| `andel_dekning` | DECIMAL | Dekningsandel (0-1) |

---

## Del 3: Transformasjonslogikk

### 3.1 Fylkesendringer 2022-2023 vs 2024

Fra 2024 ble flere fylker splittet opp:

| Fylke 2022-2023 | Fylke(r) 2024 |
|-----------------|---------------|
| 30 Viken | 31 Østfold, 32 Akershus, 33 Buskerud |
| 38 Vestfold og Telemark | 39 Vestfold, 40 Telemark |
| 42 Agder | (uendret) |
| 50 Trøndelag | (uendret) |
| 54 Troms og Finnmark | 55 Troms, 56 Finnmark |

### 3.2 Mappingtabell for fylker

```sql
-- Opprett mappingtabell for konsistent fylkesrapportering
CREATE TABLE fylke_mapping AS
SELECT * FROM (VALUES
    ('30', '31', 'Viken', 'Østfold'),
    ('30', '32', 'Viken', 'Akershus'),
    ('30', '33', 'Viken', 'Buskerud'),
    ('38', '39', 'Vestfold og Telemark', 'Vestfold'),
    ('38', '40', 'Vestfold og Telemark', 'Telemark'),
    ('54', '55', 'Troms og Finnmark', 'Troms'),
    ('54', '56', 'Troms og Finnmark', 'Finnmark')
) AS t(gammelt_fylkenr, nytt_fylkenr, gammelt_fylkenavn, nytt_fylkenavn);
```

### 3.3 SQL-script: Opprett faktatabell

```sql
-- Opprett denormalisert faktatabell fra årlige datafiler
CREATE TABLE dekning_fakta AS

-- 2022 data
SELECT
    2022 as aar,
    a.adresse_id,
    a.kommunenr,
    k.kommunenavn,
    a.fylkenr,
    f.fylkenavn,
    a.postnr,
    a.poststed,
    a.grunnkrets_id,
    a.boligtype,
    a.antall_husstander,
    'fbb' as dekningstype,
    fbb.tilbyder,
    fbb.teknologi,
    fbb.hastighet_ned,
    fbb.hastighet_opp,
    NULL as signalstyrke
FROM adr_2022 a
JOIN fbb_2022 fbb ON a.adresse_id = fbb.adresse_id
LEFT JOIN kommune_dim k ON a.kommunenr = k.kommunenr
LEFT JOIN fylke_dim f ON a.fylkenr = f.fylkenr

UNION ALL

SELECT
    2022 as aar,
    a.adresse_id,
    a.kommunenr,
    k.kommunenavn,
    a.fylkenr,
    f.fylkenavn,
    a.postnr,
    a.poststed,
    a.grunnkrets_id,
    a.boligtype,
    a.antall_husstander,
    'mob' as dekningstype,
    mob.tilbyder,
    mob.teknologi,
    NULL as hastighet_ned,
    NULL as hastighet_opp,
    mob.signalstyrke
FROM adr_2022 a
JOIN mob_2022 mob ON a.adresse_id = mob.adresse_id
LEFT JOIN kommune_dim k ON a.kommunenr = k.kommunenr
LEFT JOIN fylke_dim f ON a.fylkenr = f.fylkenr

-- Gjenta for 2023 og 2024...
;

-- Eksporter til parquet
COPY dekning_fakta TO 'dekning_fakta.parquet' (FORMAT PARQUET);
```

### 3.4 SQL-script: Opprett kube

```sql
-- Opprett pre-aggregert kube for pivot-analyse
CREATE TABLE dekning_kube AS
SELECT
    aar,
    fylkenr,
    fylkenavn,
    kommunenr,
    kommunenavn,
    dekningstype,
    teknologi,
    tilbyder,
    CASE
        WHEN dekningstype = 'fbb' THEN
            CASE
                WHEN hastighet_ned >= 1000 THEN '1000+ Mbps'
                WHEN hastighet_ned >= 100 THEN '100-999 Mbps'
                WHEN hastighet_ned >= 30 THEN '30-99 Mbps'
                WHEN hastighet_ned >= 10 THEN '10-29 Mbps'
                ELSE 'Under 10 Mbps'
            END
        ELSE NULL
    END as hastighetsklasse,
    CASE
        WHEN dekningstype = 'mob' THEN signalstyrke
        ELSE NULL
    END as signalstyrke,
    COUNT(DISTINCT adresse_id) as antall_adresser,
    SUM(antall_husstander) as antall_husstander
FROM dekning_fakta
GROUP BY
    aar, fylkenr, fylkenavn, kommunenr, kommunenavn,
    dekningstype, teknologi, tilbyder,
    hastighetsklasse, signalstyrke;

-- Beregn dekningsandel per geografisk enhet
CREATE TABLE dekning_kube_med_andel AS
SELECT
    k.*,
    k.antall_husstander::DECIMAL /
        SUM(k.antall_husstander) OVER (
            PARTITION BY k.aar, k.kommunenr, k.dekningstype
        ) as andel_dekning
FROM dekning_kube k;

-- Eksporter til parquet
COPY dekning_kube_med_andel TO 'dekning_kube.parquet' (FORMAT PARQUET);
```

### 3.5 Håndtering av fylkesendringer i spørringer

```sql
-- Eksempel: Aggreger data med konsistente fylkesnavn over tid
-- Bruk 2024-struktur som standard, map eldre data

SELECT
    aar,
    COALESCE(m.nytt_fylkenr, f.fylkenr) as fylkenr,
    COALESCE(m.nytt_fylkenavn, f.fylkenavn) as fylkenavn,
    SUM(antall_husstander) as antall_husstander
FROM dekning_fakta f
LEFT JOIN fylke_mapping m ON f.fylkenr = m.gammelt_fylkenr
GROUP BY aar,
    COALESCE(m.nytt_fylkenr, f.fylkenr),
    COALESCE(m.nytt_fylkenavn, f.fylkenavn);
```

---

## Del 4: Azure-arkitektur

### 4.1 Overordnet arkitektur

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Nettleser     │────▶│  Container App   │────▶│  Blob Storage   │
│   (React)       │◀────│  (DuckDB+API)    │◀────│   (Parquet)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        JSON                  SQL                    Parquet
```

**Arkitekturprinsipp:** DuckDB kjører server-side i Container App. Klienten sender forespørsler og mottar JSON-data – ingen parquet-filer lastes til nettleseren.

### 4.2 Azure Blob Storage struktur

```
ekomstat-storage/
├── data/
│   ├── dekning_fakta.parquet      # Denormalisert faktatabell
│   ├── dekning_kube.parquet       # Pre-aggregert kube
│   └── metadata.json              # Datasett-metadata
├── raw/
│   ├── 2022/
│   │   ├── adr_2022.parquet
│   │   ├── fbb_2022.parquet
│   │   └── mob_2022.parquet
│   ├── 2023/
│   │   └── ...
│   └── 2024/
│       └── ...
├── lookup/
│   ├── kommune_dim.parquet        # Kommunedimensjon
│   ├── fylke_dim.parquet          # Fylkesdimensjon
│   └── fylke_mapping.parquet      # Mapping gamle->nye fylker
└── static/
    └── app/                       # React-applikasjon
```

### 4.3 Azure Container App oppsett

**Konfigurasjon:**

| Innstilling | Verdi |
|-------------|-------|
| SKU | Consumption |
| Min replicas | 0 |
| Max replicas | 10 |
| CPU | 1.0 |
| Memory | 2Gi |

> **Merk:** Økt CPU og minne for server-side DuckDB-spørringer.

**Miljøvariabler:**

```yaml
env:
  - name: AZURE_STORAGE_ACCOUNT
    value: ekomstatstorage
  - name: AZURE_STORAGE_CONTAINER
    value: data
  - name: PARQUET_PATH
    value: /data/dekning_kube.parquet
```

**Dockerfile:**

```dockerfile
FROM node:20-alpine

# Bygg-avhengigheter for DuckDB native binding
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY dist/ ./dist/
COPY server.js ./

EXPOSE 8080
CMD ["node", "server.js"]
```

> **Merk:** DuckDB Node.js-pakken krever native kompilering, derfor `python3 make g++`.

### 4.4 API-design

**Endepunkter:**

| Metode | Endepunkt | Beskrivelse |
|--------|-----------|-------------|
| POST | `/api/query` | Kjør SQL-spørring, returner JSON |
| GET | `/api/pivot` | Hent pivot-data med filtre (query params) |
| GET | `/api/filters` | Hent unike filterverdier per kolonne |
| GET | `/api/metadata` | Datasett-metadata (kolonner, rader, etc.) |
| GET | `/health` | Helsesjekk for Container App |

**API-eksempler:**

```javascript
// POST /api/query - Kjør SQL-spørring
POST /api/query
Content-Type: application/json

{
  "sql": "SELECT fylkenavn, teknologi, SUM(antall_husstander) as husstander FROM dekning_kube WHERE aar = ? GROUP BY fylkenavn, teknologi",
  "params": [2024]
}

Response:
{
  "columns": ["fylkenavn", "teknologi", "husstander"],
  "rows": [
    ["Oslo", "Fiber", 245000],
    ["Oslo", "5G", 312000],
    ...
  ],
  "rowCount": 156,
  "queryTimeMs": 45
}
```

```javascript
// GET /api/pivot - Hent pivot-data med filtre
GET /api/pivot?aar=2024&fylkenr=03&rows=teknologi&cols=tilbyder&value=antall_husstander

Response:
{
  "rowHeaders": ["Fiber", "5G", "4G", "DSL"],
  "colHeaders": ["Telenor", "Telia", "Ice"],
  "data": [
    [120000, 85000, 45000],
    [95000, 72000, 38000],
    ...
  ],
  "totals": {
    "row": [250000, 205000, ...],
    "col": [315000, 257000, 183000],
    "grand": 755000
  }
}
```

```javascript
// GET /api/filters - Hent filterverdier
GET /api/filters?columns=aar,fylkenavn,teknologi

Response:
{
  "aar": [2022, 2023, 2024],
  "fylkenavn": ["Oslo", "Rogaland", "Vestland", ...],
  "teknologi": ["Fiber", "5G", "4G", "DSL", "Kabel"]
}
```

```javascript
// GET /api/metadata
GET /api/metadata

Response:
{
  "datasets": {
    "dekning_kube": {
      "rows": 45000,
      "columns": ["aar", "fylkenr", "kommunenr", ...],
      "lastUpdated": "2024-03-15T10:30:00Z"
    }
  },
  "years": [2022, 2023, 2024]
}
```

### 4.5 Server-side DuckDB integrasjon

```javascript
// server.js - DuckDB Node.js oppsett
import duckdb from 'duckdb';
import express from 'express';

const app = express();
app.use(express.json());

// Initialiser DuckDB og last parquet ved oppstart
const db = new duckdb.Database(':memory:');
const conn = db.connect();

// Last parquet-fil fra Blob Storage ved oppstart
conn.run(`
  CREATE TABLE dekning_kube AS
  SELECT * FROM read_parquet('${process.env.PARQUET_PATH}')
`);

// POST /api/query - Kjør parameterisert SQL
app.post('/api/query', (req, res) => {
  const { sql, params = [] } = req.body;

  // Valider at SQL kun er SELECT
  if (!sql.trim().toUpperCase().startsWith('SELECT')) {
    return res.status(400).json({ error: 'Kun SELECT-spørringer tillatt' });
  }

  conn.all(sql, ...params, (err, rows) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json({
      columns: rows.length > 0 ? Object.keys(rows[0]) : [],
      rows: rows.map(r => Object.values(r)),
      rowCount: rows.length
    });
  });
});

// GET /api/filters - Hent unike verdier
app.get('/api/filters', (req, res) => {
  const columns = req.query.columns?.split(',') || [];
  const result = {};

  for (const col of columns) {
    conn.all(
      `SELECT DISTINCT ${col} FROM dekning_kube ORDER BY ${col}`,
      (err, rows) => {
        result[col] = rows.map(r => r[col]);
      }
    );
  }
  res.json(result);
});

app.listen(8080);
```

**Klient-side (React):**

```javascript
// Hent pivot-data fra API
async function fetchPivotData(filters) {
  const params = new URLSearchParams({
    aar: filters.year,
    rows: 'teknologi',
    cols: 'tilbyder',
    value: 'antall_husstander'
  });

  const response = await fetch(`/api/pivot?${params}`);
  return response.json();
}

// Kjør egendefinert spørring
async function runQuery(sql, params = []) {
  const response = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params })
  });
  return response.json();
}
```

### 4.6 Sikkerhet og ytelse

**Sikkerhet:**
- Blob Storage med privat tilgang (kun via Container App)
- Managed Identity for Container App -> Blob Storage
- HTTPS påkrevd
- Kun SELECT-spørringer tillatt i `/api/query`
- Parameteriserte spørringer for å forhindre SQL-injection

**Ytelse:**
- CDN foran Container App for statiske filer
- Parquet-filer med effektiv komprimering (Snappy/Zstd)
- DuckDB holder data i minne for raske spørringer
- Pre-aggregerte kuber reduserer datamengde
- Server-side caching av filterverdier

---

## Vedlegg: Komplett transformasjonsscript

Se `scripts/transform_data.sql` for komplett DuckDB-script som:
1. Leser rådata fra alle år
2. Håndterer fylkesendringer
3. Oppretter faktatabell og kube
4. Eksporterer til parquet
