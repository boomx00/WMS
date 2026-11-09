-- Loose packs in stock opname (both per-SKU SOSKU and by-location).
-- Needs scripts/migration-loose-packs.sql first. Safe to re-run.
--   docker exec -i wms-db psql -U postgres -d wms_v2 < scripts/migration-loose-packs-opname.sql
-- PowerShell, local:
--   Get-Content scripts\migration-loose-packs-opname.sql | docker exec -i wms-db psql -U postgres -d wms_v2

BEGIN;

-- Per-SKU opname: loose packs locked with system_qty
ALTER TABLE stock_opname_skus
  ADD COLUMN IF NOT EXISTS system_packs integer NOT NULL DEFAULT 0;

-- Opname lines at packs locations count loose packs
ALTER TABLE stock_opname_items
  ADD COLUMN IF NOT EXISTS counts_in_packs boolean NOT NULL DEFAULT false;
ALTER TABLE stock_opname_items
  ADD COLUMN IF NOT EXISTS system_packs integer NOT NULL DEFAULT 0;
ALTER TABLE stock_opname_items
  ADD COLUMN IF NOT EXISTS counted_packs integer;
ALTER TABLE stock_opname_items
  ADD COLUMN IF NOT EXISTS difference_packs integer NOT NULL DEFAULT 0;

-- Count history: delta / resulting_total of a packs line are in packs
ALTER TABLE stock_opname_count_events
  ADD COLUMN IF NOT EXISTS counts_in_packs boolean NOT NULL DEFAULT false;

COMMIT;
