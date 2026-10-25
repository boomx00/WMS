-- Dynamic locations — schema
--
-- Location types move from the hard-coded Postgres enum `location_type`
-- into a `location_types` table, so each client can define their own.
-- locations.type keeps the same text codes (RACK, FLOOR, OUTBOUND_WH, ...)
-- and now references location_types.code.
--
-- Total Stock columns move into a `stock_columns` table (Settings → Total
-- Stock Columns), seeded with today's four: Export, Defect, Good Stock,
-- Outbound WH.
--
-- Also adds to locations:
--   is_receiving           inbound lands here (FLOOR)
--   is_staging             picks go here, ships leave from here (OUTBOUND_WH)
--   counts_in_total_stock  whether the location is part of Total Stock
--   stock_column_id        which Total Stock column it shows under
-- and to settings: marking_enabled (order marking on/off; on), and
-- sales_orders.pick_to_location_id (where each SO was last picked to).
--
-- Warehouses (parent locations): every location belongs to one ("Finished
-- Goods" to start), with its own Total Stock columns and its own default
-- receiving / staging location for the PDA's pickers.
--
-- Also converts databases that ran an earlier draft of this script (which
-- stored Total Stock columns as an enum, locations.stock_bucket, and the
-- receiving / outbound location as a one-per-role locations.role).
--
-- Run with (bash, on the VPS):
--   docker exec -i wms-db psql -v ON_ERROR_STOP=1 -U postgres -d wms_v2 < scripts/migration-location-types.sql
-- or (PowerShell, local):
--   Get-Content scripts\migration-location-types.sql | docker exec -i wms-db psql -v ON_ERROR_STOP=1 -U postgres -d wms_v2
-- Run this BEFORE deploying the code.
-- Safe to run more than once: later runs never overwrite values edited on
-- the Locations page.

BEGIN;

-- 1. location_types table
CREATE TABLE IF NOT EXISTS location_types (
  id serial PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  allows_multiple_sku boolean NOT NULL DEFAULT true,
  has_position boolean NOT NULL DEFAULT false,
  pickable boolean NOT NULL DEFAULT false,
  max_pallets integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT location_types_code_unique UNIQUE (code)
);

-- 2. Seed types with rules that match what the code does today:
--   FLOOR       mixed SKUs, pickable (+ Default Picking)
--   OUTBOUND_WH mixed SKUs, not a pick source
--   RACK        1 SKU only, has Area/X/Y, pickable, max 14 pallets
--   DESTROY     mixed SKUs, not a pick source
--   LEFTOVER    mixed SKUs, not a pick source
INSERT INTO location_types
  (code, name, allows_multiple_sku, has_position, pickable, max_pallets, sort_order)
VALUES
  ('FLOOR',       'Floor',       true,  false, true,  NULL, 10),
  ('OUTBOUND_WH', 'Outbound WH', true,  false, false, NULL, 20),
  ('RACK',        'Rack',        false, true,  true,  14,   30),
  ('DESTROY',     'Destroy',     true,  false, false, NULL, 40),
  ('LEFTOVER',    'Leftover',    true,  false, false, NULL, 50)
ON CONFLICT (code) DO NOTHING;

-- 3. locations.type: enum -> text (skipped if already text)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'locations'
      AND column_name = 'type' AND data_type = 'USER-DEFINED'
  ) THEN
    ALTER TABLE locations ALTER COLUMN type TYPE text USING type::text;
  END IF;
END $$;

-- 4. Every location's type must exist in location_types
DO $$ BEGIN
  ALTER TABLE locations
    ADD CONSTRAINT locations_type_location_types_code_fk
    FOREIGN KEY (type) REFERENCES location_types (code)
    ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Receiving / staging locations. Any number of locations can have
-- each. Only set on the first run (when the columns are added), so later
-- runs never undo what was set on the Locations page.
DO $$
DECLARE
  had_role boolean;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'is_receiving'
  ) THEN
    RETURN;
  END IF;

  had_role := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'role'
  );

  ALTER TABLE locations
    ADD COLUMN is_receiving boolean NOT NULL DEFAULT false,
    ADD COLUMN is_staging boolean NOT NULL DEFAULT false;

  IF had_role THEN
    -- Earlier draft: keep whichever locations held the roles.
    EXECUTE $q$ UPDATE locations SET is_receiving = true WHERE role::text = 'RECEIVING' $q$;
    EXECUTE $q$ UPDATE locations SET is_staging = true WHERE role::text = 'OUTBOUND' $q$;
  ELSE
    UPDATE locations SET is_receiving = true WHERE code = 'FLOOR';
    UPDATE locations SET is_staging = true WHERE code = 'OUTBOUND_WH';
  END IF;
END $$;

-- A location is receiving or staging, not both.
DO $$ BEGIN
  ALTER TABLE locations
    ADD CONSTRAINT locations_receiving_or_staging CHECK (NOT (is_receiving AND is_staging));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP INDEX IF EXISTS locations_role_idx;
ALTER TABLE locations DROP COLUMN IF EXISTS role;
DROP TYPE IF EXISTS location_role;

-- The staging location each SO was last picked into ("Pick to" on the
-- PDA), so the picking screen goes straight back to it.
DO $$ BEGIN
  ALTER TABLE sales_orders ADD COLUMN pick_to_location_id integer
    CONSTRAINT sales_orders_pick_to_location_id_locations_id_fk
    REFERENCES locations (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Order marking on/off (Settings → Locations & Marking); on by default.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS marking_enabled boolean NOT NULL DEFAULT true;

-- 6b. Marked stock is now tracked per staging location, from the location
-- on each order-tagged stock event. Corrections and Tambahan releases used
-- to log their CLAIM with no location; until now there was only one
-- staging location, so those all belong to it (OUTBOUND_WH).
UPDATE location_stock_events e
SET source_location_id = s.id, destination_location_id = s.id
FROM (
  SELECT id FROM locations WHERE is_staging
  ORDER BY (code = 'OUTBOUND_WH') DESC, code LIMIT 1
) s
WHERE e.type = 'CLAIM'
  AND e.source_location_id IS NULL
  AND e.destination_location_id IS NULL
  AND (e.sales_order_id IS NOT NULL OR e.tambahan_order_id IS NOT NULL);

-- 7. Total Stock settings per location. Today every location counts in the
-- total; Good Stock = the FLOOR location + every rack, EXPOR / DEFECT and
-- OUTBOUND_WH have their own columns, and the rest count in the total only.
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS counts_in_total_stock boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS stock_columns (
  id serial PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT stock_columns_name_unique UNIQUE (name)
);

-- Only on the first run (before locations.stock_column_id exists), so a
-- later run never re-creates a deleted column or undoes an edit.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'stock_column_id'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO stock_columns (name, sort_order) VALUES
    ('Export', 10), ('Defect', 20), ('Good Stock', 30), ('Outbound WH', 40)
  ON CONFLICT (name) DO NOTHING;

  ALTER TABLE locations ADD COLUMN stock_column_id integer
    CONSTRAINT locations_stock_column_id_stock_columns_id_fk
    REFERENCES stock_columns (id) ON DELETE RESTRICT;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'stock_bucket'
  ) THEN
    -- Earlier draft: keep whatever was already set on the Locations page.
    EXECUTE $q$
      UPDATE locations l SET stock_column_id = c.id
      FROM stock_columns c
      WHERE c.name = CASE l.stock_bucket::text
        WHEN 'GOOD' THEN 'Good Stock' WHEN 'EXPORT' THEN 'Export' WHEN 'DEFECT' THEN 'Defect' END
    $q$;
  ELSE
    UPDATE locations l SET stock_column_id = c.id
    FROM stock_columns c
    WHERE c.name = CASE
      WHEN l.type = 'RACK' OR l.code = 'FLOOR' THEN 'Good Stock'
      WHEN l.code = 'EXPOR' THEN 'Export'
      WHEN l.code = 'DEFECT' THEN 'Defect' END;
  END IF;

  UPDATE locations l SET stock_column_id = c.id
  FROM stock_columns c
  WHERE c.name = 'Outbound WH' AND l.type = 'OUTBOUND_WH';
END $$;

ALTER TABLE locations DROP COLUMN IF EXISTS stock_bucket;
DROP TYPE IF EXISTS location_stock_bucket;

-- 8. The old enum is no longer used by any column.
-- (If this fails, some other column still uses it — nothing is changed,
--  since the whole script runs in one transaction.)
DROP TYPE IF EXISTS location_type;

-- 9. Warehouses (parent locations), e.g. Finished Goods / Raw Material.
-- Every location belongs to one, Total Stock columns are per warehouse,
-- and each warehouse has its own default receiving / staging location for
-- the PDA's pickers. Existing locations and columns all go to
-- "Finished Goods". Only on the first run (before locations.warehouse_id
-- exists), so later runs never undo what was set on the web.
CREATE TABLE IF NOT EXISTS warehouses (
  id serial PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  default_receiving_location_id integer
    CONSTRAINT warehouses_default_receiving_location_id_locations_id_fk
    REFERENCES locations (id) ON DELETE SET NULL,
  default_staging_location_id integer
    CONSTRAINT warehouses_default_staging_location_id_locations_id_fk
    REFERENCES locations (id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT warehouses_name_unique UNIQUE (name)
);

DO $$
DECLARE
  fg integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'locations' AND column_name = 'warehouse_id'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO warehouses (name, sort_order) VALUES ('Finished Goods', 10) ON CONFLICT (name) DO NOTHING;
  SELECT id INTO fg FROM warehouses WHERE name = 'Finished Goods';

  ALTER TABLE locations ADD COLUMN warehouse_id integer
    CONSTRAINT locations_warehouse_id_warehouses_id_fk
    REFERENCES warehouses (id) ON DELETE RESTRICT;
  UPDATE locations SET warehouse_id = fg;
  ALTER TABLE locations ALTER COLUMN warehouse_id SET NOT NULL;

  ALTER TABLE stock_columns ADD COLUMN warehouse_id integer
    CONSTRAINT stock_columns_warehouse_id_warehouses_id_fk
    REFERENCES warehouses (id) ON DELETE CASCADE;
  UPDATE stock_columns SET warehouse_id = fg;
  ALTER TABLE stock_columns ALTER COLUMN warehouse_id SET NOT NULL;
  ALTER TABLE stock_columns DROP CONSTRAINT IF EXISTS stock_columns_name_unique;
  ALTER TABLE stock_columns
    ADD CONSTRAINT stock_columns_warehouse_name_unique UNIQUE (warehouse_id, name);

  -- Defaults: from an earlier draft that kept them on settings, otherwise
  -- FLOOR / OUTBOUND_WH (or the only receiving / staging location).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'default_receiving_location_id'
  ) THEN
    EXECUTE format(
      'UPDATE warehouses w SET default_receiving_location_id = s.default_receiving_location_id,
         default_staging_location_id = s.default_staging_location_id
       FROM (SELECT default_receiving_location_id, default_staging_location_id FROM settings LIMIT 1) s
       WHERE w.id = %s', fg);
  ELSE
    UPDATE warehouses SET
      default_receiving_location_id = (SELECT id FROM locations WHERE is_receiving ORDER BY (code = 'FLOOR') DESC, code LIMIT 1),
      default_staging_location_id = (SELECT id FROM locations WHERE is_staging ORDER BY (code = 'OUTBOUND_WH') DESC, code LIMIT 1)
    WHERE id = fg;
  END IF;
END $$;

ALTER TABLE settings DROP COLUMN IF EXISTS default_receiving_location_id;
ALTER TABLE settings DROP COLUMN IF EXISTS default_staging_location_id;

-- Warehouses can be deactivated (Locations → Warehouses).
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 10. Warnings for setups the PDA's pickers can't resolve
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM locations WHERE is_receiving) THEN
    RAISE WARNING 'No receiving location (expected the location coded FLOOR) — set one in "Used for" on the Locations page.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM locations WHERE is_staging) THEN
    RAISE WARNING 'No staging location (expected the location coded OUTBOUND_WH) — set one in "Used for" on the Locations page.';
  END IF;
END $$;

COMMIT;

-- Check afterwards:
--   SELECT t.code, t.name, t.allows_multiple_sku, t.has_position, t.pickable,
--          t.max_pallets, count(l.id) AS locations
--   FROM location_types t LEFT JOIN locations l ON l.type = t.code
--   GROUP BY t.id ORDER BY t.sort_order;
--
--   SELECT l.code, l.type, l.is_receiving, l.is_staging, l.counts_in_total_stock,
--          c.name AS shown_under
--   FROM locations l LEFT JOIN stock_columns c ON c.id = l.stock_column_id
--   WHERE l.type <> 'RACK' OR l.is_receiving OR l.is_staging ORDER BY l.code;
--
--   SELECT w.name, r.code AS default_receiving, s.code AS default_staging,
--          (SELECT count(*) FROM locations l WHERE l.warehouse_id = w.id) AS locations
--   FROM warehouses w
--   LEFT JOIN locations r ON r.id = w.default_receiving_location_id
--   LEFT JOIN locations s ON s.id = w.default_staging_location_id
--   ORDER BY w.sort_order;
