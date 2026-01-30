# Dekningsdata-dokumentasjon

Dokumentasjon for historiske og konsoliderte dekningsfiler.

---

## Konsoliderte filer (anbefalt)

### dekning_tek.parquet - Teknologidekning (2013-2024)

**Bruk denne filen for alle spørsmål om teknologidekning over tid!**

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| ar | Int32 | År (2013-2024) |
| fylke | String | Fylkesnavn eller "NASJONALT" |
| geo | String | "totalt", "tettbygd", eller "spredtbygd" |
| tek | String | Teknologitype (se under) |
| dekning | Double | Dekningsandel (0-1) |

**Teknologier (tek):**

| tek | Beskrivelse |
|-----|-------------|
| fiber | Fiberoptisk (FTTH) |
| kabel | Kabel-TV nett (HFC) |
| fiber_kabel | Enten fiber eller kabel |
| fiber_kabel_dsl | Fiber, kabel eller DSL |
| ftb | Fast trådløst bredbånd |
| dsl | DSL-teknologier |
| 4g | 4G mobildekning |
| 4g_inne | 4G innendørs |
| 4g_ute | 4G utendørs |
| 4g_antenne | 4G med antenne |
| 5g | 5G mobildekning |
| 5g_inne | 5G innendørs |
| 5g_ute | 5G utendørs |
| 5g_antenne | 5G med antenne |
| kabelbasert | All kabelbasert teknologi |
| radio | Radiobasert |
| satellitt | Satellitt |

**Tilgjengelige år per dimensjon:**

| Dimensjon | År | Merknad |
|-----------|-----|---------|
| Nasjonalt totalt | 2013-2024 | Komplett |
| Nasjonalt geo (tett/spredt) | 2016-2024 | |
| Per fylke | 2016-2024 | Ulik fylkesinndeling |

### dekning_hast.parquet - Hastighetsdekning (2010-2024)

**Bruk denne filen for alle spørsmål om hastighetsdekning over tid!**

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| ar | Int32 | År (2010-2024) |
| fylke | String | Fylkesnavn eller "NASJONALT" |
| geo | String | "totalt", "tettbygd", eller "spredtbygd" |
| ned | Double | Nedlastingshastighet i Mbit/s |
| opp | Double | Opplastingshastighet i Mbit/s |
| dekning | Double | Dekningsandel (0-1) |

**Standardhastighetsklasser:**

| ned/opp | Beskrivelse |
|---------|-------------|
| 30/5 | Grunnleggende bredbånd |
| 100/10 | Standard høyhastighet |
| 100/100 | Symmetrisk høyhastighet |
| 1000/1000 | Gigabit |

**Tilgjengelige år per dimensjon:**

| Dimensjon | År | Merknad |
|-----------|-----|---------|
| Nasjonalt totalt | 2010-2024 | Komplett |
| Nasjonalt geo (tett/spredt) | 2021-2024 | |
| Per fylke | 2017, 2021-2024 | Begrenset |

---

## Query Patterns for konsoliderte filer

### Teknologidekning over tid

```sql
-- Fiberdekning nasjonalt alle år
SELECT ar, ROUND(dekning * 100, 1) as prosent
FROM 'lib/dekning_tek.parquet'
WHERE tek = 'fiber' AND fylke = 'NASJONALT' AND geo = 'totalt'
ORDER BY ar

-- Sammenlign teknologier
SELECT ar,
    ROUND(MAX(CASE WHEN tek = 'fiber' THEN dekning END) * 100, 1) as fiber,
    ROUND(MAX(CASE WHEN tek = 'kabel' THEN dekning END) * 100, 1) as kabel,
    ROUND(MAX(CASE WHEN tek = '5g' THEN dekning END) * 100, 1) as g5
FROM 'lib/dekning_tek.parquet'
WHERE fylke = 'NASJONALT' AND geo = 'totalt'
GROUP BY ar ORDER BY ar
```

### Hastighetsdekning over tid

```sql
-- 100/100 Mbit dekning nasjonalt
SELECT ar, ROUND(dekning * 100, 1) as prosent
FROM 'lib/dekning_hast.parquet'
WHERE fylke = 'NASJONALT' AND geo = 'totalt' AND ned = 100 AND opp = 100
ORDER BY ar

-- Flere hastighetsklasser
SELECT ar,
    ROUND(MAX(CASE WHEN ned = 30 AND opp = 5 THEN dekning END) * 100, 1) as h30_5,
    ROUND(MAX(CASE WHEN ned = 100 AND opp = 100 THEN dekning END) * 100, 1) as h100_100,
    ROUND(MAX(CASE WHEN ned = 1000 AND opp = 1000 THEN dekning END) * 100, 1) as h1000_1000
FROM 'lib/dekning_hast.parquet'
WHERE fylke = 'NASJONALT' AND geo = 'totalt'
GROUP BY ar ORDER BY ar
```

### Tettsted vs spredtbygd (digital divide)

```sql
-- Fiber: tettbygd vs spredtbygd
SELECT ar,
    ROUND(MAX(CASE WHEN geo = 'tettbygd' THEN dekning END) * 100, 1) as tettbygd,
    ROUND(MAX(CASE WHEN geo = 'spredtbygd' THEN dekning END) * 100, 1) as spredtbygd,
    ROUND((MAX(CASE WHEN geo = 'tettbygd' THEN dekning END) -
           MAX(CASE WHEN geo = 'spredtbygd' THEN dekning END)) * 100, 1) as gap
FROM 'lib/dekning_tek.parquet'
WHERE tek = 'fiber' AND fylke = 'NASJONALT'
GROUP BY ar ORDER BY ar
```

### Fylkesfordelt dekning

```sql
-- Fiber per fylke et gitt år
SELECT fylke, ROUND(dekning * 100, 1) as prosent
FROM 'lib/dekning_tek.parquet'
WHERE tek = 'fiber' AND ar = 2024 AND geo = 'totalt' AND fylke != 'NASJONALT'
ORDER BY prosent DESC

-- Ett fylkes utvikling over tid
SELECT ar, ROUND(dekning * 100, 1) as prosent
FROM 'lib/dekning_tek.parquet'
WHERE tek = 'fiber' AND fylke = 'OSLO' AND geo = 'totalt'
ORDER BY ar
```

### Tips for konsoliderte filer

- **Dekningsverdier er desimaltall (0-1)** - multipliser med 100 for prosent
- **Teknologi-termer er normalisert**: fiber (ikke FTTH), kabel (ikke HFC), ftb (ikke FWA)
- **Geo-verdier er normalisert**: totalt, tettbygd, spredtbygd
- **Fylker**: Både gamle (18) og nye (11/15) fylkesinndelinger finnes - velg riktig år
- **NASJONALT**: Brukes i stedet for "Norge totalt" eller "Hele Norge"

---

## 2021 Dekningsdata (aggregert)

2021-data er aggregert på fylke/kommune-nivå (ikke adresse-nivå som 2022+).

### dekning_fylke.parquet

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| fylke | String | Fylkesnavn (11 fylker + "Norge") |
| geo | String | "totalt", "tettbygd", eller "spredtbygd" |
| kabelbasert | Double | Dekning kabelbasert (0-1) |
| fiber | Double | Fiberdekning (0-1) |
| hfc | Double | HFC/kabel-TV dekning (0-1) |
| hfc31 | Double | HFC 3.1 dekning (0-1) |
| fiber_hfc | Double | Fiber + HFC kombinert (0-1) |
| dsl | Double | DSL-dekning (0-1) |
| ftb | Double | Fast trådløst bredbånd (0-1) |
| lte_inne | Double | 4G innendørs (0-1) |
| lte_ute | Double | 4G utendørs (0-1) |
| lte_antenne | Double | 4G med antenne (0-1) |
| g5_inne | Double | 5G innendørs (0-1) |
| g5_ute | Double | 5G utendørs (0-1) |
| g5_antenne | Double | 5G med antenne (0-1) |
| wifi | Double | WiFi/WiMax (0-1) |
| h10 | Double | ≥10 Mbit dekning (0-1) |
| h30 | Double | ≥30 Mbit dekning (0-1) |
| h50 | Double | ≥50 Mbit dekning (0-1) |
| h100 | Double | ≥100 Mbit dekning (0-1) |
| h100_100 | Double | ≥100/100 Mbit dekning (0-1) |
| h1000 | Double | ≥1000 Mbit dekning (0-1) |
| h1000_1000 | Double | ≥1000/1000 Mbit dekning (0-1) |

### dekning_kommune.parquet

Samme kolonner som dekning_fylke.parquet, pluss:

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| komnavn | String | Kommunenavn (STORE BOKSTAVER) |
| fylke | String | Fylkesnavn |

### Eksempel-spørringer for 2021

```sql
-- Fiberdekning per fylke 2021
SELECT fylke, ROUND(fiber * 100, 1) as fiber_pct
FROM 'lib/2021/dekning_fylke.parquet'
WHERE geo = 'totalt' AND fylke != 'Norge'
ORDER BY fiber_pct DESC

-- Sammenlign tettbygd vs spredtbygd nasjonalt
SELECT geo, ROUND(fiber * 100, 1) as fiber_pct, ROUND(h100 * 100, 1) as h100_pct
FROM 'lib/2021/dekning_fylke.parquet'
WHERE fylke = 'Norge'

-- Kommuner med lavest fiberdekning
SELECT komnavn, fylke, ROUND(fiber * 100, 1) as fiber_pct
FROM 'lib/2021/dekning_kommune.parquet'
WHERE geo = 'totalt'
ORDER BY fiber ASC
LIMIT 10
```

---

## Historiske dekningsdata (2012-2020) - Legacy

Aggregerte dekningsdata fra tidligere år, lagret som parquet-filer for rask lesing.

**Teknologi-mapping (historikk vs nyere data):**

| Historikk-tek | Nyere parquet | Beskrivelse |
|---------------|---------------|-------------|
| FTTH | fiber | Fiber to the Home |
| HFC | kabel | Hybrid Fiber-Coaxial (kabel-TV nett) |
| FTTH + HFC | fiber + kabel | Kombinert fiber og kabel |
| VDSL / xDSL | - | DSL-teknologier (ikke i nyere parquet) |
| FWA | ftb | Fast trådløst bredbånd |
| LTE inne/ute | 4g | 4G mobildekning |
| 5G | 5g | 5G mobildekning |

### historikk_speed_nasjonalt.parquet (2012-2020)

Nasjonal dekning per hastighetsklasse.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| ned | Int32 | Nedlastingshastighet (Mbit/s) |
| opp | Int32 | Opplastingshastighet (Mbit/s) |
| ar | Int32 | År |
| dekning | Double | Dekningsandel (0-1) |
| fylke | String | Alltid "Norge totalt" |

**Hastighetsklasser (ned/opp Mbit/s):**
- 1000/1000, 100/100, 100/10, 50/10, 30/5, 25/5, 10/0.8, 4/0.5

### historikk_tek_nasjonalt.parquet (2013-2020)

Nasjonal dekning per teknologi.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| tek | String | Teknologitype |
| ar | Int32 | År |
| dekning | Double | Dekningsandel (0-1) |

**Teknologier:** 5G, FTTH, FTTH + HFC, FTTH + HFC + VDSL, FWA, HFC, LTE inne, VDSL, VDSL + ADSL

### historikk_tek_fylke.parquet (2018-2020)

Dekning per teknologi og fylke.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| fylke | String | Fylkesnavn (11 fylker + "Hele Norge") |
| tek | String | Teknologitype |
| ar | Int32 | År |
| dekning | Double | Dekningsandel (0-1) |

**Fylker:** Agder, Hele Norge, Innlandet, Møre og Romsdal, Nordland, Oslo, Rogaland, Troms og Finnmark, Trøndelag, Vestfold og Telemark, Vestland, Viken

**Teknologier:** FTTH + HFC, FTTH + HFC + VDSL

### historikk_tek_geo_nasjonalt.parquet (2016-2020)

Nasjonal dekning per teknologi og geografitype (tettsted/utkant).

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| geo | String | "Tettsted" eller "Utkant" |
| ar | Int32 | År |
| tek | String | Teknologitype |
| dekning | Double | Dekningsandel (0-1) |

**Teknologier:** FTTH, FTTH + HFC, FTTH + HFC + VDSL, FWA, HFC, LTE inne, LTE ute med antenne, VDSL, xDSL

---

## Eldre dekningsdata (2007-2020)

**VIKTIG:** For spørsmål om historiske data fra 2007-2011, eller for kontekst om hva "dekning" betydde i ulike perioder, **les `historie.md`** først. Denne filen forklarer:
- Definisjonen av "grunnleggende bredbånd" over tid (640 kbit/s → 4 Mbit/s → 30 Mbit/s)
- Hvilke teknologier som var tilgjengelige
- Hvordan metoder og rapportering har endret seg

### Oversikt over eldre parquet-filer

| Fil | Innhold | År | Rader |
|-----|---------|-----|-------|
| `eldre_nasjonal_2007_2011.parquet` | Nasjonale estimater | 2007-2011 | 7 |
| `eldre_fylke_2010.parquet` | Fylkesdekning (18 fylker) | 2010 | 20 |
| `eldre_speed_2010.parquet` | Hastighetsdekning | 2010 | 8 |
| `eldre_tek_fylke_2016_2017.parquet` | Teknologi per fylke | 2016-2017 | 40 |
| `eldre_speed_fylke_2016_2017.parquet` | Hastighet per fylke | 2017 | 20 |
| `eldre_fylke_2018_2020.parquet` | Fiber/HFC per fylke | 2018-2020 | 50 |
| `eldre_naering_2018_2020.parquet` | Skoler, helsebygg, forvaltning | 2018-2020 | 2002 |
| `eldre_kommune_2018_2020.parquet` | Kommunedata h100/100 | 2019-2020 | 778 |

### eldre_nasjonal_2007_2011.parquet

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| ar | Int64 | År |
| dato | String | Dato for estimat |
| grunndekning | Float64 | Grunnleggende dekning (640/128 kbit/s) |
| inkl_mobil | Float64 | Inkludert mobilt bredbånd |
| fast_aksess | Float64 | Kun fast aksess (ADSL, fiber, kabel) |
| merke | String | Merknad (juni, desember, estimat) |

**Viktig kontekst:** "Grunndekning" i 2007-2011 = 640/128 kbit/s, som i dag er utilstrekkelig.

### eldre_fylke_2010.parquet

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| fylke | String | Fylkesnavn (18 fylker + Norge totalt) |
| total | Float64 | Total dekning (fast + radio) |
| fast | Float64 | Kun fast aksess |
| radio | Float64 | Radiobasert (inkl. WiMax) |
| mobil | Float64 | Mobilt bredbånd |
| ar | Int64 | År |

### eldre_naering_2018_2020.parquet

Bredbåndsdekning for offentlige institusjoner.

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| fylke | String | Fylkesnavn |
| ar | Int64 | År |
| kategori | String | barneskoler, ungdomsskoler, videregående skoler, helsebygg, forvaltning, rådhus, alle næringsbygg |
| hastighet | String | Hastighetsklasse (≥10/0,8, ≥30/5, ≥100/100, etc.) |
| dekning | Float64 | Dekningsprosent |

### Eksempel-spørringer for eldre data

```sql
-- Nasjonal dekning 2007-2011
SELECT ar, grunndekning, fast_aksess, inkl_mobil
FROM 'lib/eldre_nasjonal_2007_2011.parquet'
ORDER BY ar

-- Fylkesfordeling 2010 (18 fylker)
SELECT fylke, total, fast, radio
FROM 'lib/eldre_fylke_2010.parquet'
WHERE fylke != 'Norge totalt'
ORDER BY fast DESC

-- Bredbånd i barneskoler 2020
SELECT fylke, dekning
FROM 'lib/eldre_naering_2018_2020.parquet'
WHERE kategori = 'barneskoler'
  AND hastighet = '≥100/100'
  AND ar = 2020
ORDER BY dekning DESC

-- Fiberutvikling per fylke 2016-2020
SELECT fylke, ar, fiber
FROM 'lib/eldre_tek_fylke_2016_2017.parquet'
UNION ALL
SELECT fylke, ar, fiber
FROM 'lib/eldre_fylke_2018_2020.parquet'
ORDER BY fylke, ar
```

**Merk:** Dekningsverdier er lagret som desimaltall (0-1), ikke prosent. Multipliser med 100 for prosent.
