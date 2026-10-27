-- K3 import per SOSKU session (Stock Opname Summary -> Import K3).
-- Run once:
--   docker exec -i wms-db psql -U postgres -d wms_v2 < k3_sessions_migration.sql
BEGIN;

-- A date can now have several K3 imports (one per PIC's file), so the
-- (warehouse, date) index is no longer unique.
DROP INDEX IF EXISTS k3_stock_imports_warehouse_date_idx;
CREATE INDEX k3_stock_imports_warehouse_date_idx ON k3_stock_imports (warehouse_id, stock_date);

-- Which SOSKU session uses which K3 import (one import per session).
CREATE TABLE k3_stock_import_sessions (
  id serial PRIMARY KEY,
  import_id integer NOT NULL,
  opname_number varchar(50) NOT NULL,
  CONSTRAINT k3_stock_import_sessions_import_id_k3_stock_imports_id_fk
    FOREIGN KEY (import_id) REFERENCES k3_stock_imports(id) ON DELETE CASCADE,
  -- Postgres shortens this name to 63 characters (a NOTICE says so) — same as Drizzle.
  CONSTRAINT k3_stock_import_sessions_opname_number_stock_opname_opname_number_fk
    FOREIGN KEY (opname_number) REFERENCES stock_opname(opname_number) ON DELETE CASCADE
);
CREATE UNIQUE INDEX k3_stock_import_sessions_opname_idx ON k3_stock_import_sessions (opname_number);
CREATE INDEX k3_stock_import_sessions_import_idx ON k3_stock_import_sessions (import_id);

-- Keep the K3 imports made so far: each one is given to every SOSKU session
-- that locked SKUs on its date (Jakarta day).
INSERT INTO k3_stock_import_sessions (import_id, opname_number)
SELECT DISTINCT ON (s.opname_number) i.id, s.opname_number
FROM k3_stock_imports i
JOIN stock_opname_skus s
  ON to_char(s.added_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') = i.stock_date::text
WHERE s.opname_number LIKE 'SOSKU-%'
ORDER BY s.opname_number, i.imported_at DESC
ON CONFLICT DO NOTHING;

-- Imports no session uses (e.g. a date with no SOSKU left) aren't shown anywhere.
DELETE FROM k3_stock_imports i
WHERE NOT EXISTS (SELECT 1 FROM k3_stock_import_sessions l WHERE l.import_id = i.id);

COMMIT;
