# Span

**Span** er et spørrespråk for å analysere dekningsdata for telekommunikasjon i Norge. Navnet reflekterer kjernespørsmålet: *«Hva spenner dekningen over?»*

## Eksempel

```
HAS fiber AND speed >= 100
IN urban
COUNT homes
BY county
SHOW percent
SORT percent DESC
TOP 10
```

*«Topp 10 fylker etter andel husstander i tettbygde strøk med fiber og minst 100 Mbps»*

## Hvorfor Span?

- **Intuitivt** – Leser nesten som naturlig norsk/engelsk
- **Konsist** – 7 nøkkelord dekker de fleste behov
- **Fleksibelt** – Fra enkle tellinger til komplekse overlapp-analyser

## Spørringsstruktur

```
HAS <dekningsbetingelse>     -- Obligatorisk: Hva slags dekning?
IN <populasjonsfilter>       -- Valgfri: Hvilken befolkning?
COUNT <metrikk>              -- Obligatorisk: Hva telles?
BY <gruppering>              -- Valgfri: Hvordan gruppere?
SHOW <format>                -- Valgfri: Hva vises?
SORT <felt> <retning>        -- Valgfri: Sortering
TOP <n>                      -- Valgfri: Maks rader
```

## Dekningsbetingelser (HAS)

### Teknologiflagg
`fiber` | `cable` | `dsl` | `5g` | `4g` | `fwa`

### Sammenligninger
```
speed >= 100              -- Nedlastingshastighet i Mbps
upload >= 50              -- Opplastingshastighet i Mbps
provider = Telenor        -- Leverandør
tech = Fiber              -- Teknologitype
```

### Logiske operatorer
```
fiber AND speed >= 100    -- Begge betingelser
fiber OR cable            -- En av betingelsene
NOT dsl                   -- Negasjon
```

### Kvantifiserere
```
ANY(fiber, cable)         -- Minst én matcher (standard)
ALL(fiber, 5g)            -- Har BÅDE fiber OG 5G
NONE(speed >= 30)         -- Ingen tilbud med >= 30 Mbps
```

## Populasjonsfiltre (IN)

| Filter | Eksempel |
|--------|----------|
| Fylke | `county = Oslo` |
| Kommune | `municipality = Bergen` |
| Tettbygd | `urban` |
| Spredtbygd | `rural` |
| Bygningstype | `type = cabin` |
| Postnummer | `postal = 5000` |

## Metrikker (COUNT)

| Metrikk | Beskrivelse |
|---------|-------------|
| `homes` | Husstander |
| `addresses` | Adresser |
| `buildings` | Bygninger |
| `cabins` | Fritidsboliger |

## Gruppering (BY)

`national` | `county` | `municipality` | `postal` | `urban` | `provider` | `tech`

## Flere eksempler

### Nasjonal fiberdekning
```
HAS fiber
COUNT homes
```

### Husstander uten høyhastighet
```
HAS NONE(speed >= 30)
COUNT homes
BY county
SORT count DESC
```

### Dekning fra flere leverandører
```
HAS ALL(provider IN (Telenor, Telia))
COUNT addresses
SHOW percent
```

### Sammenlign hastighetsnivåer
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

## Dokumentasjon

- [DSL-doc.md](DSL-doc.md) – Komplett brukerdokumentasjon (norsk)
- [DSL.md](DSL.md) – Språkspesifikasjon med EBNF-grammatikk
- [FILEORG.md](FILEORG.md) – Datastruktur og Azure-arkitektur
- [reference/DATA_DICT.md](reference/DATA_DICT.md) – Kolonnedefinisjoner for parquet-filer

## Lisens

TBD
