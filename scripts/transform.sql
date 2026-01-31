-- Span Data Transformation Script
-- Transformerer rådata til optimaliserte parquet-filer for Span Query
-- Kjør med: duckdb < scripts/transform.sql

-- =============================================================================
-- STEG 1: Opprett span_dekning.parquet (hovedfaktatabell)
-- =============================================================================
-- Denormalisert tabell med én rad per adresse-år-teknologi-tilbyder
-- Hastigheter konverteres fra kbps til Mbps
-- Teknologier normaliseres til engelske navn
-- Fylker normaliseres til 2024-struktur via fylke24-kolonnen

COPY (
  WITH tek_map AS (
    -- Teknologi-mapping: norsk → engelsk/forenklet
    SELECT * FROM (VALUES
      ('fiber', 'fiber'),
      ('kabel', 'cable'),
      ('ftb', 'fwa'),
      ('radio', 'fwa'),
      ('satellitt', 'satellite'),
      ('annet', 'other'),
      ('4g', '4g'),
      ('5g', '5g')
    ) AS t(tek_orig, tek_norm)
  ),

  -- 2024 FBB data
  fbb_2024 AS (
    SELECT
      2024 AS aar,
      f.adrid,
      a.fylke,
      a.komnavn,
      a.postnr,
      a.ertett,
      a.hus,
      a.fritid,
      'fbb' AS dektype,
      f.tilb,
      tm.tek_norm AS tek,
      ROUND(f.ned / 1000.0, 1) AS ned_mbps,
      ROUND(f.opp / 1000.0, 1) AS opp_mbps
    FROM 'data/2024/fbb.parquet' f
    JOIN 'data/2024/adr.parquet' a ON f.adrid = a.adrid
    JOIN tek_map tm ON f.tek = tm.tek_orig
  ),

  -- 2024 MOB data
  mob_2024 AS (
    SELECT
      2024 AS aar,
      m.adrid,
      a.fylke,
      a.komnavn,
      a.postnr,
      a.ertett,
      a.hus,
      a.fritid,
      'mob' AS dektype,
      m.tilb,
      tm.tek_norm AS tek,
      ROUND(m.ned / 1000.0, 1) AS ned_mbps,
      ROUND(m.opp / 1000.0, 1) AS opp_mbps
    FROM 'data/2024/mob.parquet' m
    JOIN 'data/2024/adr.parquet' a ON m.adrid = a.adrid
    JOIN tek_map tm ON m.tek = tm.tek_orig
  ),

  -- 2023 FBB data (bruker fylke24-kolonnen for 2024-struktur)
  fbb_2023 AS (
    SELECT
      2023 AS aar,
      f.adrid,
      a.fylke24 AS fylke,
      a.komnavn,
      a.postnr,
      a.ertett,
      a.hus,
      a.fritid,
      'fbb' AS dektype,
      f.tilb,
      tm.tek_norm AS tek,
      ROUND(f.ned / 1000.0, 1) AS ned_mbps,
      ROUND(f.opp / 1000.0, 1) AS opp_mbps
    FROM 'data/2023/fbb.parquet' f
    JOIN 'data/2023/adr.parquet' a ON f.adrid = a.adrid
    JOIN tek_map tm ON f.tek = tm.tek_orig
  ),

  -- 2023 MOB data (bruker fylke24-kolonnen for 2024-struktur)
  mob_2023 AS (
    SELECT
      2023 AS aar,
      m.adrid,
      a.fylke24 AS fylke,
      a.komnavn,
      a.postnr,
      a.ertett,
      a.hus,
      a.fritid,
      'mob' AS dektype,
      m.tilb,
      tm.tek_norm AS tek,
      ROUND(m.ned / 1000.0, 1) AS ned_mbps,
      ROUND(m.opp / 1000.0, 1) AS opp_mbps
    FROM 'data/2023/mob.parquet' m
    JOIN 'data/2023/adr.parquet' a ON m.adrid = a.adrid
    JOIN tek_map tm ON m.tek = tm.tek_orig
  ),

  -- 2022 FBB data (ingen mob for 2022, bruker fylke24 for 2024-struktur)
  fbb_2022 AS (
    SELECT
      2022 AS aar,
      f.adrid,
      a.fylke24 AS fylke,
      a.komnavn,
      a.postnr,
      a.ertett,
      a.hus,
      a.fritid,
      'fbb' AS dektype,
      f.tilb,
      tm.tek_norm AS tek,
      ROUND(f.ned / 1000.0, 1) AS ned_mbps,
      ROUND(f.opp / 1000.0, 1) AS opp_mbps
    FROM 'data/2022/fbb.parquet' f
    JOIN 'data/2022/adr.parquet' a ON f.adrid = a.adrid
    JOIN tek_map tm ON f.tek = tm.tek_orig
  )

  -- Kombiner alle år og dekningstyper
  SELECT * FROM fbb_2024
  UNION ALL
  SELECT * FROM mob_2024
  UNION ALL
  SELECT * FROM fbb_2023
  UNION ALL
  SELECT * FROM mob_2023
  UNION ALL
  SELECT * FROM fbb_2022

) TO 'data/span_dekning.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);

-- Vis radtall
SELECT 'span_dekning.parquet opprettet med ' || COUNT(*) || ' rader' AS status
FROM 'data/span_dekning.parquet';


-- =============================================================================
-- STEG 2: Opprett span_adr.parquet (adressetotaler for nevner)
-- =============================================================================
-- Deduplisert adresseliste per år for beregning av dekningsprosent

COPY (
  WITH adr_2024 AS (
    SELECT
      2024 AS aar,
      adrid,
      fylke,
      komnavn,
      postnr,
      ertett,
      hus,
      fritid
    FROM 'data/2024/adr.parquet'
  ),

  adr_2023 AS (
    SELECT
      2023 AS aar,
      a.adrid,
      a.fylke24 AS fylke,
      a.komnavn,
      a.postnr,
      a.ertett,
      a.hus,
      a.fritid
    FROM 'data/2023/adr.parquet' a
  ),

  adr_2022 AS (
    SELECT
      2022 AS aar,
      a.adrid,
      a.fylke24 AS fylke,
      a.komnavn,
      a.postnr,
      a.ertett,
      a.hus,
      a.fritid
    FROM 'data/2022/adr.parquet' a
  )

  SELECT * FROM adr_2024
  UNION ALL
  SELECT * FROM adr_2023
  UNION ALL
  SELECT * FROM adr_2022

) TO 'data/span_adr.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);

-- Vis radtall
SELECT 'span_adr.parquet opprettet med ' || COUNT(*) || ' rader' AS status
FROM 'data/span_adr.parquet';


-- =============================================================================
-- STEG 3: Opprett span_tek_kube.parquet (pre-aggregert teknologikube)
-- =============================================================================
-- Pre-aggregert for raske BY-spørringer på teknologi

COPY (
  SELECT
    aar,
    fylke,
    komnavn,
    ertett,
    tek,
    COUNT(DISTINCT adrid) AS adr_count,
    SUM(hus) AS hus_sum,
    SUM(fritid) AS fritid_sum
  FROM 'data/span_dekning.parquet'
  GROUP BY aar, fylke, komnavn, ertett, tek
) TO 'data/span_tek_kube.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);

-- Vis radtall
SELECT 'span_tek_kube.parquet opprettet med ' || COUNT(*) || ' rader' AS status
FROM 'data/span_tek_kube.parquet';


-- =============================================================================
-- STEG 4: Verifisering
-- =============================================================================

-- Sjekk teknologifordeling
SELECT 'Teknologifordeling:' AS info;
SELECT aar, tek, COUNT(*) as rader, COUNT(DISTINCT adrid) as adresser
FROM 'data/span_dekning.parquet'
GROUP BY aar, tek
ORDER BY aar, tek;

-- Sjekk fylkefordeling 2024
SELECT 'Fylker 2024:' AS info;
SELECT fylke, COUNT(*) as rader
FROM 'data/span_adr.parquet'
WHERE aar = 2024
GROUP BY fylke
ORDER BY fylke;

-- Test: Fiberdekning per fylke 2024
SELECT 'Fiberdekning per fylke 2024:' AS info;
WITH pop AS (
  SELECT fylke, SUM(hus) as total
  FROM 'data/span_adr.parquet'
  WHERE aar = 2024
  GROUP BY fylke
),
cov AS (
  SELECT fylke, SUM(hus) as covered
  FROM 'data/span_dekning.parquet'
  WHERE aar = 2024 AND tek = 'fiber'
  GROUP BY fylke
)
SELECT
  p.fylke,
  COALESCE(c.covered, 0) as dekket,
  p.total,
  ROUND(100.0 * COALESCE(c.covered, 0) / p.total, 1) as prosent
FROM pop p
LEFT JOIN cov c USING(fylke)
ORDER BY prosent DESC;

-- Filstørrelser (omtrentlig fra radtall)
SELECT 'Transformasjon fullført!' AS status;
