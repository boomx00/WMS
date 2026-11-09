-- Loose packs: a location type "Counted in packs" (e.g. the PACKS location),
-- Unpack / Repack on Other Transactions → Packs, and the ledger columns.
-- Run this BEFORE deploying the code:
--   docker exec -i wms-db psql -U postgres -d wms_v2 < scripts/migration-loose-packs.sql
-- PowerShell, local:
--   Get-Content scripts\migration-loose-packs.sql | docker exec -i wms-db psql -U postgres -d wms_v2
--
-- ALTER TYPE ... ADD VALUE can't run inside a transaction block, so this
-- file has no BEGIN/COMMIT. Every statement is safe to re-run.

-- 1. Location type rule
ALTER TABLE location_types
  ADD COLUMN IF NOT EXISTS counts_in_packs boolean NOT NULL DEFAULT false;

-- 2. Loose packs held at a location (only on "Counted in packs" locations)
ALTER TABLE location_stock
  ADD COLUMN IF NOT EXISTS loose_packs integer NOT NULL DEFAULT 0;

-- 3. Ledger event types
ALTER TYPE location_stock_event_type ADD VALUE IF NOT EXISTS 'UNPACK';
ALTER TYPE location_stock_event_type ADD VALUE IF NOT EXISTS 'REPACK';

-- 4. Unpack / Repack records
DO $$ BEGIN
  CREATE TYPE pack_transaction_type AS ENUM ('UNPACK', 'REPACK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS pack_transactions (
  id serial PRIMARY KEY,
  transaction_code text NOT NULL,
  type pack_transaction_type NOT NULL,
  item_id integer NOT NULL REFERENCES items(id),
  carton_location_id integer NOT NULL REFERENCES locations(id),
  pack_location_id integer NOT NULL REFERENCES locations(id),
  cartons integer NOT NULL,
  packs integer NOT NULL,
  damaged_packs integer NOT NULL DEFAULT 0,
  packs_per_carton integer NOT NULL,
  notes text,
  user_id integer NOT NULL REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pack_transactions_created_idx ON pack_transactions (created_at);

-- 5. Ledger columns
ALTER TABLE location_stock_events
  ADD COLUMN IF NOT EXISTS loose_packs integer NOT NULL DEFAULT 0;
ALTER TABLE location_stock_events
  ADD COLUMN IF NOT EXISTS pack_transaction_id integer REFERENCES pack_transactions(id);

-- 6. Optional: the Packs location type and a PACKS location. Uncomment and
-- set the warehouse id (SELECT id, name FROM warehouses;) — or create both
-- on the Locations page instead.
-- INSERT INTO location_types (code, name, allows_multiple_sku, has_position, pickable, counts_in_packs, sort_order)
--   VALUES ('PACKS', 'Packs', true, false, false, true, 900)
--   ON CONFLICT (code) DO NOTHING;
-- INSERT INTO locations (code, type, warehouse_id, counts_in_total_stock)
--   VALUES ('PACKS', 'PACKS', 1, true)
--   ON CONFLICT DO NOTHING;
