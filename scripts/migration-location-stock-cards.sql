-- Location Stock cards (Settings → Location Stock Cards): the summary cards
-- at the top of the Location Stock page. Each has a name (English, plus
-- optional Indonesian / Chinese), the location types that add to it, and
-- optionally the units its total is shown in.
--
-- Seeded with today's three cards so the page looks the same until you
-- change them:
--   Total Stock (Floor + Rack) — open pick areas + rack-position types
--   Total Floor                — open pick areas (pickable, no rack position)
--   Total Rack                 — types with a rack position
-- Their names come from the page's current labels, translations included.
--
-- Run after scripts/migration-decimal-quantities.sql. Safe to run more
-- than once (seeds only when there are no cards yet):
--   docker exec -i wms-db psql -U postgres -d wms_v2 < scripts/migration-location-stock-cards.sql

BEGIN;

-- Replaces the single "Location Stock totals" setting from an earlier
-- package, if that was run.
ALTER TABLE settings DROP COLUMN IF EXISTS location_stock_total_unit_ids;

CREATE TABLE IF NOT EXISTS location_stock_cards (
  id serial PRIMARY KEY,
  name text NOT NULL,
  name_id text,
  name_zh text,
  location_types text[] NOT NULL DEFAULT '{}'::text[],
  unit_ids integer[],
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);

WITH label AS (
  SELECT key, text_en, text_id, text_zh
    FROM page_labels
   WHERE page = 'location_stock' AND key IN ('total_stock_card', 'total_floor_card', 'total_rack')
),
floor_types AS (
  SELECT coalesce(array_agg(code ORDER BY sort_order, code), '{}') AS codes
    FROM location_types WHERE pickable AND NOT has_position
),
rack_types AS (
  SELECT coalesce(array_agg(code ORDER BY sort_order, code), '{}') AS codes
    FROM location_types WHERE has_position
),
seed (key, default_name, codes, sort_order) AS (
  SELECT 'total_stock_card', 'Total Stock (Floor + Rack)', (SELECT codes FROM floor_types) || (SELECT codes FROM rack_types), 10
  UNION ALL SELECT 'total_floor_card', 'Total Floor', (SELECT codes FROM floor_types), 20
  UNION ALL SELECT 'total_rack', 'Total Rack', (SELECT codes FROM rack_types), 30
)
INSERT INTO location_stock_cards (name, name_id, name_zh, location_types, sort_order)
SELECT coalesce(nullif(btrim(l.text_en), ''), s.default_name),
       nullif(btrim(l.text_id), ''),
       nullif(btrim(l.text_zh), ''),
       s.codes,
       s.sort_order
  FROM seed s
  LEFT JOIN label l ON l.key = s.key
 WHERE NOT EXISTS (SELECT 1 FROM location_stock_cards);

COMMIT;

SELECT id, name, name_id, name_zh, location_types, unit_ids, sort_order
  FROM location_stock_cards
 ORDER BY sort_order, id;
