-- Location Stock cards: which units of measure their totals are shown in
-- (Settings → Location Stock totals). Empty = automatic (each product's
-- primary unit). Run after scripts/migration-decimal-quantities.sql.
-- Safe to run more than once:
--   docker exec -i wms-db psql -U postgres -d wms_v2 < scripts/migration-location-stock-total-units.sql

ALTER TABLE settings ADD COLUMN IF NOT EXISTS location_stock_total_unit_ids integer[];
