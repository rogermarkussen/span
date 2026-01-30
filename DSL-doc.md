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
COUNT homes
```

Dette betyr: *«Tell hvor mange husstander som har fiberdekning»*

### Grunnleggende struktur

Alle Span-spørringer følger dette mønsteret:

```
HAS <hva slags dekning>
[IN <hvilken befolkning>]
COUNT <hva vi teller>
[BY <hvordan gruppere>]
[SHOW <hva som vises>]
[SORT <sortering>]
[TOP <antall rader>]
[FOR <år> | FOR (<år>, <år>, ...)]
```

Klammeparentes `[ ]` betyr at delen er valgfri.

---

## Nøkkelord

### Obligatoriske nøkkelord

| Nøkkelord | Formål | Beskrivelse |
|-----------|--------|-------------|
| `HAS` | Dekningsfilter | Hvilke dekningskriterier må være oppfylt? |
| `COUNT` | Metrikk | Hva skal vi telle? |

### Valgfrie nøkkelord

| Nøkkelord | Formål | Standard | Beskrivelse |
|-----------|--------|----------|-------------|
| `IN` | Populasjonsfilter | Alle adresser | Hvilken populasjon måles mot? |
| `BY` | Gruppering | Nasjonalt totalt | Hvordan bryte ned resultatene? |
| `SHOW` | Visningsformat | `both` | Hva skal vises? |
| `SORT` | Sortering | `percent DESC` | Hvordan sortere resultatene? |
| `TOP` | Begrensning | Ingen grense | Maks antall rader å returnere? |
| `FOR` | Årsfilter | API-standard | Hvilket/hvilke år skal spørres? |

---

## Dekningsvilkår (HAS)

### Teknologiflagg

Bruk disse for å sjekke om en adresse har en bestemt teknologi:

| Flagg | Beskrivelse |
|-------|-------------|
| `fiber` | Har fiberdekning |
| `cable` | Har kabeldekning |
| `dsl` | Har DSL-dekning |
| `5g` | Har 5G-dekning |
| `4g` | Har 4G-dekning |
| `fwa` | Har Fast Trådløst Aksess |

**Eksempel:**
```
HAS fiber
COUNT homes
```

### Felt med verdier

For mer presise spørringer kan du bruke felt med sammenligninger:

| Felt | Type | Verdier | Beskrivelse |
|------|------|---------|-------------|
| `tech` | tekst | Fiber, Cable, DSL, 5G, 4G, FWA | Teknologitype |
| `speed` | tall | Mbps | Nedlastningshastighet |
| `upload` | tall | Mbps | Opplastingshastighet |
| `provider` | tekst | Telenor, Telia, Ice, ... | Leverandør |

### Sammenligningsoperatorer

| Operator | Betydning | Eksempel |
|----------|-----------|----------|
| `=` | Er lik | `tech = Fiber` |
| `!=` | Er ikke lik | `provider != Telenor` |
| `>=` | Større eller lik | `speed >= 100` |
| `<=` | Mindre eller lik | `speed <= 30` |
| `>` | Større enn | `speed > 50` |
| `<` | Mindre enn | `speed < 10` |
| `IN` | I liste | `provider IN (Telenor, Telia)` |

**Eksempel:**
```
HAS speed >= 100
COUNT homes
```

### Logiske operatorer

Kombiner flere betingelser:

| Operator | Betydning | Eksempel |
|----------|-----------|----------|
| `AND` | Begge betingelser | `fiber AND speed >= 100` |
| `OR` | En av betingelsene | `fiber OR cable` |
| `NOT` | Negasjon | `NOT dsl` |

**Prioritet:** `NOT` → `AND` → `OR`

Bruk parenteser for å overstyre prioritet:
```
HAS (fiber AND speed >= 100) OR (5g AND speed >= 50)
HAS NOT (fiber OR cable)
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
HAS ANY(fiber, cable)           -- Har fiber ELLER kabel
HAS ALL(fiber, cable)           -- Har BÅDE fiber OG kabel
HAS NONE(speed >= 30)           -- Ingen tilbud med hastighet >= 30
HAS ALL(provider IN (Telenor, Telia))  -- Dekket av både Telenor og Telia
```

---

## Populasjonsfiltre (IN)

Begrens hvilken befolkning du måler mot.

### Tilgjengelige felt

| Felt | Type | Verdier | Beskrivelse |
|------|------|---------|-------------|
| `county` | tekst | Oslo, Rogaland, ... | Fylke |
| `municipality` | tekst | Bergen, Trondheim, ... | Kommune |
| `urban` | flagg | - | Kun tettbygde strøk |
| `rural` | flagg | - | Kun spredtbygde strøk |
| `type` | tekst | house, apartment, cabin | Bygningstype |
| `postal` | tekst | 0001-9999 | Postnummer |

**Eksempler:**
```
IN county = Oslo
IN urban
IN type = cabin
IN county = Rogaland AND urban
```

---

## Metrikker (COUNT)

Hva du vil telle:

| Metrikk | Beskrivelse |
|---------|-------------|
| `homes` | Antall husstander |
| `addresses` | Antall adresser |
| `buildings` | Antall bygninger |
| `cabins` | Antall fritidsboliger |

---

## Gruppering (BY)

Hvordan resultatene skal brytes ned:

| Nivå | Beskrivelse |
|------|-------------|
| `national` | Én nasjonal total (standard) |
| `county` | Per fylke (11 rader) |
| `municipality` | Per kommune (~356 rader) |
| `postal` | Per postnummer |
| `urban` | Tettbygd vs. spredtbygd (2 rader) |
| `provider` | Per leverandør |
| `tech` | Per teknologi |

---

## Visningsformat (SHOW)

Hva som vises i resultatet:

| Format | Beskrivelse |
|--------|-------------|
| `count` | Kun antall med dekning |
| `percent` | Kun prosent |
| `both` | Antall, total og prosent (standard) |

---

## Sortering (SORT)

Sorter resultatene:

```
SORT count ASC      -- Lavest antall først
SORT count DESC     -- Høyest antall først
SORT percent ASC    -- Lavest prosent først
SORT percent DESC   -- Høyest prosent først
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

Spesifiser hvilket år eller hvilke år som skal brukes:

```
FOR 2024                -- Enkelt år
FOR (2023, 2024)        -- Flere år
FOR (2022, 2023, 2024)  -- Tre år
```

Når du bruker flere år, får resultatet en ekstra `aar`-kolonne.

**Eksempler:**
```
HAS fiber COUNT homes FOR 2024              -- Data fra 2024
HAS fiber COUNT homes BY county FOR 2024    -- Per fylke i 2024
HAS fiber COUNT homes FOR (2023, 2024)      -- Sammenlign 2023 og 2024
```

> **Tips:** Når `FOR` utelates, brukes årstallet fra API-innstillingene.

---

## Praktiske eksempler

### Eksempel 1: Nasjonal fiberdekning

*«Hvor stor andel av husstandene har fiber?»*

```
HAS fiber
COUNT homes
```

**Resultat:**
| homes_covered | total_homes | percent |
|---------------|-------------|---------|
| 1 850 000 | 2 400 000 | 77.1% |

---

### Eksempel 2: Fiberdekning per fylke

*«Fiberdekning i prosent per fylke, sortert høyest først»*

```
HAS fiber
COUNT homes
BY county
SHOW percent
SORT percent DESC
```

**Resultat:**
| county | percent |
|--------|---------|
| Oslo | 89.2% |
| Rogaland | 82.1% |
| Vestland | 78.4% |
| ... | ... |

---

### Eksempel 3: Høyhastighetsdekning i tettbygde strøk

*«Husstander i tettbygde strøk med 100+ Mbps, per fylke»*

```
HAS speed >= 100
IN urban
COUNT homes
BY county
```

---

### Eksempel 4: Hyttedekning

*«Hvor stor andel av hyttene har bredbånd?»*

```
HAS fiber OR cable OR dsl OR fwa
IN type = cabin
COUNT cabins
SHOW percent
```

---

### Eksempel 5: Overlapp - Både fiber og 5G

*«Adresser som har BÅDE fiber- og 5G-dekning»*

```
HAS ALL(fiber, 5g)
COUNT addresses
BY county
```

---

### Eksempel 6: Leverandørsammenligning

*«Fiberdekning per leverandør, topp 5»*

```
HAS fiber
COUNT homes
BY provider
SORT count DESC
TOP 5
```

---

### Eksempel 7: Hastighetsnivåer

*«Fordeling av hastighetsnivåer nasjonalt»*

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

> **Tips:** Bruk `---` for å kjøre flere spørringer samtidig.

---

### Eksempel 8: 5G i spredtbygde strøk

*«5G-dekning i spredtbygde strøk per fylke, topp 10»*

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

### Eksempel 9: Fler-leverandør-dekning

*«Adresser med dekning fra både Telenor og Telia»*

```
HAS ALL(provider IN (Telenor, Telia))
COUNT addresses
SHOW percent
```

---

### Eksempel 10: Underdekkede områder

*«Husstander uten høyhastighetsalternativer»*

```
HAS NONE(speed >= 30)
COUNT homes
BY county
SORT count DESC
```

---

## Flervalgs-spørringer

Du kan kombinere flere spørringer med `---`-separatoren:

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
  HAS fiber HAVING speed >= 100
            ^^^^^^
  Did you mean 'AND'?
```

```
Error: Unknown field 'bandwidth' at position 1
  HAS bandwidth >= 100
      ^^^^^^^^^
  Available fields: speed, upload, tech, provider
```

```
Error: Missing required COUNT clause
  HAS fiber
  BY county
  ^^^^^^^^^
  Query must include COUNT (e.g., COUNT homes)
```

---

## Hurtigreferanse

```
HAS <dekningsbetingelse>     -- Obligatorisk: Hva slags dekning?
  fiber|cable|dsl|5g|4g|fwa  -- Teknologiflagg
  speed >= 100               -- Hastighetssammenligning
  provider = Telenor         -- Leverandørfilter
  ANY(...)|ALL(...)|NONE(...)-- Kvantifiserere

IN <populasjonsfilter>       -- Valgfri: Hvilken befolkning?
  county = Oslo              -- Fylkesfilter
  urban|rural                -- Tettbygd/spredtbygd
  type = cabin               -- Bygningstype

COUNT <metrikk>              -- Obligatorisk: Hva telles?
  homes|addresses|buildings|cabins

BY <gruppering>              -- Valgfri: Hvordan gruppere?
  national|county|municipality|postal|urban|provider|tech

SHOW <format>                -- Valgfri: Hva vises?
  count|percent|both

SORT <felt> <retning>        -- Valgfri: Sortering
  count|percent|group ASC|DESC

TOP <n>                      -- Valgfri: Maks rader

FOR <år>                     -- Valgfri: Årsfilter
  2024 | (2023, 2024)        -- Enkelt år eller liste
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
