-- Products: Type / Brand / Tags / Supplier, and the supplier of production inbound.
-- Run once (after delete_so_migration.sql):
--   docker exec -i wms-db psql -U postgres -d wms_v2 < product_attributes_migration.sql
BEGIN;

-- Type ("Diapers"), Brand ("MAKUKU") and Tags ("XL", "34+6", ...).
ALTER TABLE items ADD COLUMN IF NOT EXISTS product_type text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

-- Suppliers: Production (in-house) or External.
CREATE TYPE supplier_kind AS ENUM ('PRODUCTION', 'EXTERNAL');
CREATE TABLE suppliers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  kind supplier_kind NOT NULL DEFAULT 'EXTERNAL',
  created_by integer,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE UNIQUE INDEX suppliers_name_idx ON suppliers (lower(name));
INSERT INTO suppliers (name, kind) VALUES ('Production', 'PRODUCTION');

-- A product's supplier.
ALTER TABLE items ADD COLUMN supplier_id integer;
ALTER TABLE items ADD CONSTRAINT items_supplier_id_suppliers_id_fk
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- Who a stock movement came from: production inbound = Production.
ALTER TABLE location_stock_events ADD COLUMN supplier_id integer;
ALTER TABLE location_stock_events ADD CONSTRAINT location_stock_events_supplier_id_suppliers_id_fk
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id);

-- Past production inbound came from Production too.
UPDATE location_stock_events
SET supplier_id = (SELECT id FROM suppliers WHERE name = 'Production')
WHERE type IN ('INBOUND', 'DEFAULT_INBOUND') AND supplier_id IS NULL;

COMMIT;
