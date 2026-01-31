# Span - Brukerdokumentasjon

## Hva er Span?

**Span** er et spørrespråk laget for å analysere dekningsdata for telekommunikasjon. Navnet reflekterer kjernespørsmålet: *«Hva spenner dekningen over?»*

Språket er designet for å være:
- **Intuitivt** - Leser nesten som naturlig norsk/engelsk
- **Konsist** - Korte nøkkelord, minimalt med unødvendig tekst
- **Fleksibelt** - Håndterer alt fra enkle tellinger til komplekse overlapp

---

## Kom i gang

### Din første spørring

Den enkleste spørringen har bare to deler:

```
HAS fiber
COUNT hus
```

Dette betyr: *«Tell hvor mange husstander som har fiberdekning»*

### Grunnleggende struktur

Alle Span-spørringer følger dette mønsteret:

```
[HAS <hva slags dekning>]
[IN <hvilken befolkning>]
COUNT <hva vi teller>
[BY <hvordan gruppere>]
[SHOW <hva som vises>]
[SORT <sortering>]
[TOP <antall rader>]
[FOR <år> | FOR (<år>, <år>, ...)]
```

Klammeparentes `[ ]` betyr at delen er valgfri.

### Spørringer uten HAS

Når `HAS` utelates, telles alle adresser eller abonnementer uten noe dekningsfilter:

```
COUNT hus BY fylke FOR 2024      -- Alle husstander per fylke
COUNT ab BY fylke FOR 2024       -- Alle abonnementer per fylke
IN tett COUNT hus FOR 2024       -- Alle husstander i tettbygde strøk
```

---

## Nøkkelord

### Nøkkelord

| Nøkkelord | Formål | Obligatorisk | Beskrivelse |
|-----------|--------|--------------|-------------|
| `HAS` | Dekningsfilter | Nei | Hvilke dekningskriterier må være oppfylt? (Utelat for «alle») |
| `COUNT` | Metrikk | Ja | Hva skal vi telle? |

### Valgfrie nøkkelord

| Nøkkelord | Formål | Standard | Beskrivelse |
|-----------|--------|----------|-------------|
| `IN` | Populasjonsfilter | Alle adresser | Hvilken populasjon måles mot? |
| `BY` | Gruppering | Nasjonalt totalt | Hvordan bryte ned resultatene? |
| `SHOW` | Visningsformat | `begge` | Hva skal vises? |
| `SORT` | Sortering | `andel DESC` | Hvordan sortere resultatene? |
| `TOP` | Begrensning | Ingen grense | Maks antall rader å returnere? |
| `FOR` | Årsfilter | API-standard | Hvilket/hvilke år skal spørres? |

---

## Dekningsvilkår (HAS)

### Teknologiflagg

Bruk disse for å sjekke om en adresse har en bestemt teknologi:

| Flagg | Beskrivelse |
|-------|-------------|
| `fiber` | Har fiberdekning |
| `kabel` | Har kabeldekning |
| `dsl` | Har DSL-dekning |
| `5g` | Har 5G-dekning |
| `4g` | Har 4G-dekning |
| `ftb` | Har Fast Trådløst Bredbånd |

**Eksempel:**
```
HAS fiber
COUNT hus
```

### Felt med verdier

For mer presise spørringer kan du bruke felt med sammenligninger:

| Felt | Type | Verdier | Beskrivelse |
|------|------|---------|-------------|
| `tek` | tekst | Fiber, Cable, DSL, 5G, 4G, FWA | Teknologitype |
| `nedhast` | tall | Mbps | Nedlastningshastighet |
| `opphast` | tall | Mbps | Opplastingshastighet |
| `tilb` | tekst | Telenor, Telia, Ice, ... | Leverandør |

### Sammenligningsoperatorer

| Operator | Betydning | Eksempel |
|----------|-----------|----------|
| `=` | Er lik | `tek = Fiber` |
| `!=` | Er ikke lik | `tilb != Telenor` |
| `>=` | Større eller lik | `nedhast >= 100` |
| `<=` | Mindre eller lik | `nedhast <= 30` |
| `>` | Større enn | `nedhast > 50` |
| `<` | Mindre enn | `nedhast < 10` |
| `IN` | I liste | `tilb IN (Telenor, Telia)` |

**Eksempel:**
```
HAS nedhast >= 100
COUNT hus
```

### Logiske operatorer

Kombiner flere betingelser:

| Operator | Betydning | Eksempel |
|----------|-----------|----------|
| `AND` | Begge betingelser | `fiber AND nedhast >= 100` |
| `OR` | En av betingelsene | `fiber OR kabel` |
| `NOT` | Negasjon | `NOT dsl` |

**Prioritet:** `NOT` → `AND` → `OR`

Bruk parenteser for å overstyre prioritet:
```
HAS (fiber AND nedhast >= 100) OR (5g AND nedhast >= 50)
HAS NOT (fiber OR kabel)
```

### Kvantifiserere (ANY, ALL, NONE)

Når en adresse har flere dekningstilbud, kan du spesifisere hvordan betingelsene skal matche:

| Kvantifiserer | Betydning | Bruk |
|---------------|-----------|------|
| `ANY(...)` | Minst én matcher | Standard oppførsel |
| `ALL(...)` | Alle må matche | For overlapp-spørringer |
| `NONE(...)` | Ingen matcher | For «uten dekning»-spørringer |

**Eksempler:**
```
HAS ANY(fiber, kabel)             -- Har fiber ELLER kabel
HAS ALL(fiber, kabel)             -- Har BÅDE fiber OG kabel
HAS NONE(nedhast >= 30)           -- Ingen tilbud med hastighet >= 30
HAS ALL(tilb IN (Telenor, Telia)) -- Dekket av både Telenor og Telia
```

---

## Populasjonsfiltre (IN)

Begrens hvilken befolkning du måler mot.

### Tilgjengelige felt

| Felt | Type | Verdier | Beskrivelse |
|------|------|---------|-------------|
| `fylke` | tekst | Oslo, Rogaland, ... | Fylke |
| `kom` | tekst | Bergen, Trondheim, ... | Kommune |
| `tett` | flagg | - | Kun tettbygde strøk |
| `spredt` | flagg | - | Kun spredtbygde strøk |
| `type` | tekst | house, apartment, cabin | Bygningstype |
| `postnr` | tekst | 0001-9999 | Postnummer |
| `private` | flagg | - | Kun privatkundeabonnementer* |
| `business` | flagg | - | Kun bedriftsabonnementer* |

\* Kun tilgjengelig med `COUNT ab`

**Eksempler:**
```
IN fylke = Oslo
IN tett
IN type = cabin
IN fylke = Rogaland AND tett
IN private                     -- Kun for COUNT ab
```

---

## Metrikker (COUNT)

Hva du vil telle:

| Metrikk | Beskrivelse |
|---------|-------------|
| `hus` | Antall husstander |
| `adr` | Antall adresser |
| `fritid` | Antall fritidsboliger |
| `ab` | Antall abonnementer |

### Abonnementer (ab)

`COUNT ab` teller faktiske abonnementer fra abonnementsdatasettet (`span_ab.parquet`), i motsetning til de andre metrikkene som teller potensielle dekningsmuligheter.

**Merk:** For abonnementer kan du bruke spesielle filtre:
- `IN private` - Kun privatkundeabonnementer
- `IN business` - Kun bedriftsabonnementer

Disse filtrene er **kun** tilgjengelige for `COUNT ab`.

**Eksempler:**
```
HAS fiber COUNT ab FOR 2024                    -- Alle fiberabonnementer
HAS fiber IN private COUNT ab BY fylke FOR 2024  -- Private fiberabonnementer per fylke
HAS nedhast >= 100 IN business COUNT ab FOR 2024 -- Bedriftsabonnementer med 100+ Mbps
```

---

## Gruppering (BY)

Hvordan resultatene skal brytes ned:

| Nivå | Beskrivelse |
|------|-------------|
| `total` | Én nasjonal total (standard) |
| `fylke` | Per fylke (11 rader) |
| `kom` | Per kommune (~356 rader) |
| `postnr` | Per postnummer |
| `tett` | Tettbygd vs. spredtbygd (2 rader) |
| `tilb` | Per leverandør |
| `tek` | Per teknologi |

---

## Visningsformat (SHOW)

Hva som vises i resultatet:

| Format | Beskrivelse |
|--------|-------------|
| `count` | Kun antall med dekning |
| `andel` | Kun prosent |
| `begge` | Antall, total og prosent (standard) |

---

## Sortering (SORT)

Sorter resultatene:

```
SORT count ASC      -- Lavest antall først
SORT count DESC     -- Høyest antall først
SORT andel ASC      -- Lavest prosent først
SORT andel DESC     -- Høyest prosent først
SORT group ASC      -- Alfabetisk A-Å
SORT group DESC     -- Alfabetisk Å-A
```

---

## Begrensning (TOP)

Vis kun de første N radene:

```
TOP 10    -- Vis kun 10 rader
TOP 5     -- Vis kun 5 rader
```

---

## Årsfilter (FOR)

Spesifiser hvilket år eller hvilke år som skal brukes.

### Eksplisitt liste

```
FOR 2024                -- Enkelt år
FOR (2023, 2024)        -- Flere år
FOR (2022, 2023, 2024)  -- Tre år
```

### Med sammenligning

Du kan også bruke operatorer for å velge år dynamisk:

```
FOR ar >= 2022         -- Alle år fra og med 2022
FOR ar = 2024          -- Samme som FOR 2024
FOR ar != 2023         -- Alle unntatt 2023
FOR ar > 2022          -- Alle etter 2022
FOR ar <= 2023         -- Alle til og med 2023
```

Tilgjengelige år i systemet: 2022, 2023, 2024

### Pivot-output (flere år)

Når du kombinerer flere år med gruppering (BY), vises årene som kolonner med prosentandel:

**Spørring:**
```
HAS fiber COUNT hus BY fylke FOR ar >= 2022
```

**Resultat:**
| gruppe | 2022 | 2023 | 2024 |
|--------|------|------|------|
| Agder | 72.3 | 75.1 | 78.9 |
| Akershus | 81.2 | 83.4 | 85.7 |
| Oslo | 85.5 | 87.2 | 89.0 |
| Norge | 75.0 | 77.5 | 80.1 |
| ... | ... | ... | ... |

Dette gjør det enkelt å sammenligne utvikling over tid.

**Eksempler:**
```
HAS fiber COUNT hus FOR 2024              -- Data fra 2024
HAS fiber COUNT hus BY fylke FOR 2024     -- Per fylke i 2024
HAS fiber COUNT hus BY fylke FOR ar >= 2022  -- Pivot med alle år
HAS 5g COUNT hus BY kom FOR (2023, 2024)  -- 5G-utvikling per kommune
```

> **Tips:** Når `FOR` utelates, brukes årstallet fra API-innstillingene.

---

## Praktiske eksempler

### Eksempel 1: Nasjonal fiberdekning

*«Hvor stor andel av husstandene har fiber?»*

```
HAS fiber
COUNT hus
```

**Resultat:**
| hus_covered | total_hus | percent |
|-------------|-----------|---------|
| 1 850 000 | 2 400 000 | 77.1% |

---

### Eksempel 2: Fiberdekning per fylke

*«Fiberdekning i prosent per fylke, sortert høyest først»*

```
HAS fiber
COUNT hus
BY fylke
SHOW andel
SORT andel DESC
```

**Resultat:**
| fylke | percent |
|-------|---------|
| Oslo | 89.2% |
| Rogaland | 82.1% |
| Vestland | 78.4% |
| ... | ... |

---

### Eksempel 3: Høyhastighetsdekning i tettbygde strøk

*«Husstander i tettbygde strøk med 100+ Mbps, per fylke»*

```
HAS nedhast >= 100
IN tett
COUNT hus
BY fylke
```

---

### Eksempel 4: Hyttedekning

*«Hvor stor andel av hyttene har bredbånd?»*

```
HAS fiber OR kabel OR dsl OR ftb
IN type = cabin
COUNT fritid
SHOW andel
```

---

### Eksempel 5: Overlapp - Både fiber og 5G

*«Adresser som har BÅDE fiber- og 5G-dekning»*

```
HAS ALL(fiber, 5g)
COUNT adr
BY fylke
```

---

### Eksempel 6: Leverandørsammenligning

*«Fiberdekning per leverandør, topp 5»*

```
HAS fiber
COUNT hus
BY tilb
SORT count DESC
TOP 5
```

---

### Eksempel 7: Hastighetsnivåer

*«Fordeling av hastighetsnivåer nasjonalt»*

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

> **Tips:** Bruk `---` for å kjøre flere spørringer samtidig.

---

### Eksempel 8: 5G i spredtbygde strøk

*«5G-dekning i spredtbygde strøk per fylke, topp 10»*

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

### Eksempel 9: Fler-leverandør-dekning

*«Adresser med dekning fra både Telenor og Telia»*

```
HAS ALL(tilb IN (Telenor, Telia))
COUNT adr
SHOW andel
```

---

### Eksempel 10: Underdekkede områder

*«Husstander uten høyhastighetsalternativer»*

```
HAS NONE(nedhast >= 30)
COUNT hus
BY fylke
SORT count DESC
```

---

### Eksempel 11: Fiberabonnementer per fylke

*«Antall private fiberabonnementer per fylke»*

```
HAS fiber
IN private
COUNT ab
BY fylke
SORT count DESC
FOR 2024
```

---

### Eksempel 12: Bedriftsabonnementer med høy hastighet

*«Bedriftsabonnementer med 100+ Mbps, per leverandør»*

```
HAS nedhast >= 100
IN business
COUNT ab
BY tilb
SORT count DESC
TOP 10
FOR 2024
```

---

## Flervalgs-spørringer

Du kan kombinere flere spørringer med `---`-separatoren:

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

API-et returnerer en array med resultater for hver spørring.

---

## Datahåndtering

### NULL-verdier
- Grupper uten adresser vises ikke i resultatet
- Manglende hastighetsverdier ekskluderes fra hastighetsfiltre
- Prosent beregnes som `NULL` hvis total = 0

### Avrunding
- Prosenter rundes av til 1 desimal
- Hele tall vises uten desimaler

---

## Feilmeldinger

Span gir tydelige feilmeldinger når noe er galt:

```
Error: Unknown keyword 'HAVING' at position 1
  HAS fiber HAVING nedhast >= 100
            ^^^^^^
  Did you mean 'AND'?
```

```
Error: Unknown field 'bandwidth' at position 1
  HAS bandwidth >= 100
      ^^^^^^^^^
  Available fields: nedhast, opphast, tek, tilb
```

```
Error: Missing required COUNT clause
  HAS fiber
  BY fylke
  ^^^^^^^^^
  Query must include COUNT (e.g., COUNT hus)
```

---

## Hurtigreferanse

```
HAS <dekningsbetingelse>     -- Valgfri: Hva slags dekning? (utelat for «alle»)
  fiber|kabel|dsl|5g|4g|ftb  -- Teknologiflagg
  nedhast >= 100             -- Hastighetssammenligning
  tilb = Telenor             -- Leverandørfilter
  ANY(...)|ALL(...)|NONE(...)-- Kvantifiserere

IN <populasjonsfilter>       -- Valgfri: Hvilken befolkning?
  fylke = Oslo               -- Fylkesfilter
  tett|spredt                -- Tettbygd/spredtbygd
  type = cabin               -- Bygningstype
  private|business           -- Kun for COUNT ab

COUNT <metrikk>              -- Obligatorisk: Hva telles?
  hus|adr|fritid|ab

BY <gruppering>              -- Valgfri: Hvordan gruppere?
  total|fylke|kom|postnr|tett|tilb|tek

SHOW <format>                -- Valgfri: Hva vises?
  count|andel|begge

SORT <felt> <retning>        -- Valgfri: Sortering
  count|andel|group ASC|DESC

TOP <n>                      -- Valgfri: Maks rader

FOR <år>                     -- Valgfri: Årsfilter
  2024                       -- Enkelt år
  (2023, 2024)               -- Liste med år
  ar >= 2022                -- Sammenligning (>=, <=, >, <, =, !=)
```

---

## Oppsummering

Med Span kan du svare på nesten alle spørsmål om dekningsdata med bare **8 nøkkelord**:

1. **HAS** - Hvilken dekning?
2. **IN** - Hvilken befolkning?
3. **COUNT** - Hva telles?
4. **BY** - Hvordan grupperes?
5. **SHOW** - Hva vises?
6. **SORT** - Hvordan sorteres?
7. **TOP** - Hvor mange rader?
8. **FOR** - Hvilket/hvilke år?

Språket er kraftig nok til komplekse analyser, men enkelt nok til å lære på noen minutter.
