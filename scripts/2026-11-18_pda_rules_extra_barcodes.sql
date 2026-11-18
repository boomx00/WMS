-- PDA rules (Settings → PDA) and extra carton barcodes per product.
-- Run with: docker exec -i wms-db psql -U postgres -d wms_v2 < this file
-- Safe to run twice.

BEGIN;

-- Settings → PDA
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pda_pick_units text[] NOT NULL DEFAULT '{STORAGE,PRIMARY}'::text[];
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pda_ship_units text[] NOT NULL DEFAULT '{PRIMARY}'::text[];
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pda_strict_mode boolean NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pda_max_pick_qty integer;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pda_max_pick_basis text NOT NULL DEFAULT 'STORAGE';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pda_max_ship_qty integer;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pda_max_ship_basis text NOT NULL DEFAULT 'STORAGE';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS item_lookup_fields text[] NOT NULL DEFAULT '{SKU,LEGACY_SKU,BARCODE}'::text[];

-- Extra carton barcodes
ALTER TABLE items ADD COLUMN IF NOT EXISTS extra_barcodes text[] NOT NULL DEFAULT '{}'::text[];
CREATE INDEX IF NOT EXISTS items_carton_barcode_idx ON items (carton_barcode);
CREATE INDEX IF NOT EXISTS items_extra_barcodes_idx ON items USING gin (extra_barcodes);

COMMIT;
