# Data Dictionary

Kolonnedefinisjoner for adresse-nivå datafiler (2022-2024).

---

## adr.parquet - Adresseregister

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| adrid | Int64 | Unik adresse-ID (primary key) |
| fylke | String | Fylkesnavn |
| komnavn | String | Kommunenavn |
| ertett | Boolean | True = tettsted, False = spredtbygd |
| hus | Int16 | Antall husstander |
| pers | Int16 | Antall personer |
| fritid | Int16 | Antall fritidsboliger |

### Fylkesendringer mellom år

Fylkesinndelingen endret seg fra 2024. Ved historiske sammenligninger vil noen fylker ha null-verdier for år de ikke eksisterte.

| 2022-2023 (11 fylker) | 2024+ (15 fylker) |
|-----------------------|-------------------|
| VIKEN | AKERSHUS, BUSKERUD, ØSTFOLD |
| VESTFOLD OG TELEMARK | VESTFOLD, TELEMARK |
| TROMS OG FINNMARK | TROMS, FINNMARK |
| AGDER | AGDER |
| INNLANDET | INNLANDET |
| MØRE OG ROMSDAL | MØRE OG ROMSDAL |
| NORDLAND | NORDLAND |
| OSLO | OSLO |
| ROGALAND | ROGALAND |
| TRØNDELAG | TRØNDELAG |
| VESTLAND | VESTLAND |

**Viktig:** Bruk alltid adr-filen fra samme år som dekningsdata (fbb/mob) for korrekt fylkesfordeling.

---

## fbb.parquet - Fastbredbånd

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| adrid | Int64 | Adresse-ID (foreign key) |
| tilb | String | Tilbydernavn |
| tek | String | "fiber", "ftb", "kabel", "radio", "satellitt", "annet" |
| ned | Int64 | Maks nedlasting i **kbps** |
| opp | Int64 | Maks opplasting i **kbps** |
| hc | Boolean | True = Homes Connected, False = Homes Passed |
| egen | Boolean | True = eier egen infrastruktur |

---

## mob.parquet - Mobildekning

**Merk:** Finnes kun fra 2023.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| adrid | Int64 | Adresse-ID |
| tilb | String | "telenor", "telia", "ice" |
| tek | String | "4g", "5g" |
| ned | Int32 | Maks nedlasting i **kbps** |

---

## ab.parquet - Abonnementer

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| adrid | Int64 | Adresse-ID (0 = ingen direkte kobling) |
| fylke | String | Fylkesnavn |
| komnavn | String | Kommunenavn |
| tilb | String | Tilbyder |
| tek | String | Teknologi |
| ned | Int64 | Abonnert hastighet i **kbps** |
| privat | Boolean | True = privat, False = bedrift |
| kol | Boolean | True = MDU (kollektiv), False = SDU |
| egen | Boolean | Egen infrastruktur |

**Viktig for ab:** Tell rader for antall abonnementer. Ikke join med adr - bruk fylke/komnavn direkte.

---

## Tilgjengelige år og filer

| År | adr | fbb | mob | ab | dekning (aggregert) |
|----|-----|-----|-----|-----|---------------------|
| 2021 | ✗ | ✗ | ✗ | ✓ | ✓ (fylke/kommune) |
| 2022 | ✓ | ✓ | ✗ | ✓ | ✗ |
| 2023 | ✓ | ✓ | ✓ | ✓ | ✗ |
| 2024 | ✓ | ✓ | ✓ | ✓ | ✗ |

---

## DuckDB Query Patterns

For direkte spørsmål (uten `/ny`), bruk DuckDB CLI. Her er vanlige mønstre.

**Viktig:** Spesifiser alltid år i stien: `'lib/2024/adr.parquet'`

### Enkle aggregeringer

```sql
-- Totalt husstander (2024)
SELECT SUM(hus) FROM 'lib/2024/adr.parquet'

-- Tell abonnementer per teknologi (2024)
SELECT tek, COUNT(*) as antall
FROM 'lib/2024/ab.parquet'
GROUP BY tek ORDER BY antall DESC

-- Tilbydere i en kommune (2024)
SELECT DISTINCT tilb FROM 'lib/2024/fbb.parquet' f
JOIN 'lib/2024/adr.parquet' a ON f.adrid = a.adrid
WHERE a.komnavn = 'HATTFJELLDAL'
```

### Dekning per område

```sql
-- Dekning (f.eks. 5G) per fylke/kommune (2024)
SELECT
    a.fylke,
    SUM(CASE WHEN har_dekning THEN a.hus ELSE 0 END) as hus_dekning,
    SUM(a.hus) as totalt_hus,
    ROUND(SUM(CASE WHEN har_dekning THEN a.hus ELSE 0 END) * 100.0 / SUM(a.hus), 1) as prosent
FROM (
    SELECT a.adrid, a.fylke, a.hus,
           EXISTS(SELECT 1 FROM 'lib/2024/mob.parquet' m
                  WHERE m.adrid = a.adrid AND m.tek = '5g') as har_dekning
    FROM 'lib/2024/adr.parquet' a
) a
GROUP BY a.fylke
ORDER BY prosent DESC
```

### Dekning med hastighetsfilter

```sql
-- 5G med minst 100 Mbit (husk: data er i kbps)
SELECT ...
EXISTS(SELECT 1 FROM 'lib/2024/mob.parquet' m
       WHERE m.adrid = a.adrid AND m.tek = '5g' AND m.ned >= 100000) as har_5g_100
```

### Konkurranse (flere tilbydere)

```sql
-- Adresser med fiber fra minst 2 tilbydere (2024)
WITH fiber_tilbydere AS (
    SELECT adrid, COUNT(DISTINCT tilb) as antall_tilbydere
    FROM 'lib/2024/fbb.parquet'
    WHERE tek = 'fiber'
    GROUP BY adrid
)
SELECT
    a.fylke,
    SUM(CASE WHEN ft.antall_tilbydere >= 2 THEN a.hus ELSE 0 END) as hus_konkurranse,
    SUM(a.hus) as totalt_hus
FROM 'lib/2024/adr.parquet' a
LEFT JOIN fiber_tilbydere ft ON a.adrid = ft.adrid
GROUP BY a.fylke
```

### Penetrasjon (dekning vs abonnement)

```sql
-- Sammenlign dekning og abonnementer per tilbyder (2024)
WITH dekning AS (
    SELECT tilb, SUM(a.hus) as hus_dekning
    FROM 'lib/2024/fbb.parquet' f
    JOIN 'lib/2024/adr.parquet' a ON f.adrid = a.adrid
    WHERE f.tek = 'fiber'
    GROUP BY tilb
),
abonnement AS (
    SELECT tilb, COUNT(*) as antall_ab
    FROM 'lib/2024/ab.parquet'
    WHERE tek = 'fiber'
    GROUP BY tilb
)
SELECT
    COALESCE(d.tilb, ab.tilb) as tilbyder,
    COALESCE(d.hus_dekning, 0) as hus_dekning,
    COALESCE(ab.antall_ab, 0) as antall_ab,
    ROUND(ab.antall_ab * 100.0 / d.hus_dekning, 1) as penetrasjon_pct
FROM dekning d
FULL OUTER JOIN abonnement ab ON d.tilb = ab.tilb
ORDER BY hus_dekning DESC
```

### Adresser uten dekning

```sql
-- Husstander uten verken fbb eller mobil (2024)
WITH fbb_adr AS (SELECT DISTINCT adrid FROM 'lib/2024/fbb.parquet'),
     mob_adr AS (SELECT DISTINCT adrid FROM 'lib/2024/mob.parquet')
SELECT a.fylke, a.komnavn, SUM(a.hus) as hus_uten_dekning
FROM 'lib/2024/adr.parquet' a
WHERE NOT EXISTS (SELECT 1 FROM fbb_adr WHERE adrid = a.adrid)
  AND NOT EXISTS (SELECT 1 FROM mob_adr WHERE adrid = a.adrid)
GROUP BY a.fylke, a.komnavn
HAVING SUM(a.hus) > 0
ORDER BY hus_uten_dekning DESC
```

### Sanity check: Abonnement uten dekning

```sql
-- Finn adresser med abonnement men uten registrert dekning (2024)
WITH fbb_adr AS (SELECT DISTINCT adrid FROM 'lib/2024/fbb.parquet')
SELECT ab.tek, ab.tilb, COUNT(*) as antall_ab
FROM 'lib/2024/ab.parquet' ab
WHERE ab.adrid > 0
  AND NOT EXISTS (SELECT 1 FROM fbb_adr WHERE adrid = ab.adrid)
GROUP BY ab.tek, ab.tilb
ORDER BY antall_ab DESC
```

### Historisk sammenligning (flere år)

```sql
-- Fiberdekning utvikling 2022-2024
SELECT
    '2022' as ar,
    SUM(CASE WHEN har_fiber THEN a.hus ELSE 0 END) as hus_fiber,
    SUM(a.hus) as totalt_hus,
    ROUND(SUM(CASE WHEN har_fiber THEN a.hus ELSE 0 END) * 100.0 / SUM(a.hus), 1) as prosent
FROM (
    SELECT a.adrid, a.hus,
           EXISTS(SELECT 1 FROM 'lib/2022/fbb.parquet' f
                  WHERE f.adrid = a.adrid AND f.tek = 'fiber') as har_fiber
    FROM 'lib/2022/adr.parquet' a
) a
UNION ALL
SELECT '2023', ... FROM 'lib/2023/...'
UNION ALL
SELECT '2024', ... FROM 'lib/2024/...'
```

### Fylkesfordelt historikk (håndtering av fylkesendringer)

```sql
-- Ved sammenligning over år med ulik fylkesinndeling,
-- aggreger til nasjonalt nivå eller bruk COALESCE for å slå sammen
-- Eksempel: Finn alle fylker på tvers av år (gir NULL for år der fylket ikke eksisterte)
SELECT
    COALESCE(a22.fylke, a23.fylke, a24.fylke) as fylke,
    SUM(a22.hus) as hus_2022,
    SUM(a23.hus) as hus_2023,
    SUM(a24.hus) as hus_2024
FROM 'lib/2024/adr.parquet' a24
FULL OUTER JOIN 'lib/2023/adr.parquet' a23 ON false  -- Kartesisk for fylkesliste
FULL OUTER JOIN 'lib/2022/adr.parquet' a22 ON false
GROUP BY fylke
ORDER BY fylke
```

---

## Tips

- Bruk alltid `duckdb -c "..."` for å kjøre queries
- **Spesifiser alltid år i stien**: `'lib/2024/fbb.parquet'`
- Husk hastighetskonvertering: 100 Mbit = 100000 kbps
- For ab: filtrer på `adrid > 0` for å unngå ukoblede abonnementer
- Bruk `EXISTS`/`NOT EXISTS` for effektive dekningssjekker
- **mob.parquet finnes kun for 2023 og 2024**
- **Ved fylkessammenligning**: 2022-2023 har 11 fylker, 2024 har 15 fylker
