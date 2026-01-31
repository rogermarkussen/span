# Span

**Span** er et spørrespråk for å analysere dekningsdata for telekommunikasjon i Norge. Navnet reflekterer kjernespørsmålet: *«Hva spenner dekningen over?»*

## Eksempel

```
HAS fiber AND nedhast >= 100
IN tett
COUNT hus
BY fylke
SHOW andel
SORT andel DESC
TOP 10
```

*«Topp 10 fylker etter andel husstander i tettbygde strøk med fiber og minst 100 Mbps»*

## Hvorfor Span?

- **Intuitivt** – Leser nesten som naturlig norsk/engelsk
- **Konsist** – 7 nøkkelord dekker de fleste behov
- **Fleksibelt** – Fra enkle tellinger til komplekse overlapp-analyser

## Spørringsstruktur

```
[HAS <dekningsbetingelse>]   -- Valgfri: Hva slags dekning? (utelat for "alle")
[IN <populasjonsfilter>]     -- Valgfri: Hvilken befolkning?
COUNT <metrikk>              -- Obligatorisk: Hva telles?
[BY <gruppering>]            -- Valgfri: Hvordan gruppere?
[SHOW <format>]              -- Valgfri: Hva vises?
[SORT <felt> <retning>]      -- Valgfri: Sortering
[TOP <n>]                    -- Valgfri: Maks rader
[FOR <år>]                   -- Valgfri: Årsfilter
```

## Dekningsbetingelser (HAS)

### Teknologiflagg
`fiber` | `kabel` | `dsl` | `5g` | `4g` | `ftb`

### Sammenligninger
```
nedhast >= 100            -- Nedlastingshastighet i Mbps
opphast >= 50             -- Opplastingshastighet i Mbps
tilb = Telenor            -- Leverandør
tek = Fiber               -- Teknologitype
```

### Logiske operatorer
```
fiber AND nedhast >= 100  -- Begge betingelser
fiber OR kabel            -- En av betingelsene
NOT dsl                   -- Negasjon
```

### Kvantifiserere
```
ANY(fiber, kabel)         -- Minst én matcher (standard)
ALL(fiber, 5g)            -- Har BÅDE fiber OG 5G
NONE(nedhast >= 30)       -- Ingen tilbud med >= 30 Mbps
```

## Populasjonsfiltre (IN)

| Filter | Eksempel |
|--------|----------|
| Fylke | `fylke = Oslo` |
| Kommune | `kom = Bergen` |
| Tettbygd | `tett` |
| Spredtbygd | `spredt` |
| Bygningstype | `type = cabin` |
| Postnummer | `postnr = 5000` |
| Privat* | `privat` |
| Bedrift* | `bedrift` |

\* Kun tilgjengelig med `COUNT ab`

## Metrikker (COUNT)

| Metrikk | Beskrivelse |
|---------|-------------|
| `hus` | Husstander |
| `adr` | Adresser |
| `fritid` | Fritidsboliger |
| `ab` | Abonnementer |

## Gruppering (BY)

`total` | `fylke` | `kom` | `postnr` | `tett` | `tilb` | `tek`

## Flere eksempler

### Nasjonal fiberdekning
```
HAS fiber
COUNT hus
```

### Husstander uten høyhastighet
```
HAS NONE(nedhast >= 30)
COUNT hus
BY fylke
SORT count DESC
```

### Dekning fra flere leverandører
```
HAS ALL(tilb IN (Telenor, Telia))
COUNT adr
SHOW andel
```

### Sammenlign hastighetsnivåer
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

### Tidsutvikling (pivot)
```
HAS fiber
COUNT hus
BY fylke
FOR ar >= 2022
```
Gir år som kolonner: `gruppe | 2022 | 2023 | 2024`

## Dokumentasjon

- [DSL-doc.md](DSL-doc.md) – Komplett brukerdokumentasjon (norsk)
- [DSL.md](DSL.md) – Språkspesifikasjon med EBNF-grammatikk
- [FILEORG.md](FILEORG.md) – Datastruktur og Azure-arkitektur
- [reference/DATA_DICT.md](reference/DATA_DICT.md) – Kolonnedefinisjoner for parquet-filer

## Lisens

TBD
