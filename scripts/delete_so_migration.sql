-- Delete SO (Sales Orders → Delete) and No Doc in Movement History.
-- Run once:
--   docker exec -i wms-db psql -U postgres -d wms_v2 < delete_so_migration.sql

-- The stock event a deleted sales order's stock is put back on FLOOR with.
ALTER TYPE location_stock_event_type ADD VALUE IF NOT EXISTS 'DELETE_SO';

-- A deleted sales order's events keep its SO number here (their
-- sales_order_id is cleared, since the SO row is gone).
ALTER TABLE location_stock_events ADD COLUMN IF NOT EXISTS deleted_so_number text;
