-- Stock Opname Summary → Report: Reconciliation (+ / −) and Final SO.
-- Run once:
--   docker exec -i wms-db psql -U postgres -d wms_v2 < reconciliation_migration.sql
BEGIN;

ALTER TABLE stock_opname_skus ADD COLUMN IF NOT EXISTS reconcile_plus integer NOT NULL DEFAULT 0;
ALTER TABLE stock_opname_skus ADD COLUMN IF NOT EXISTS reconcile_minus integer NOT NULL DEFAULT 0;
ALTER TABLE stock_opname_skus ADD COLUMN IF NOT EXISTS reconciled_at timestamp;
ALTER TABLE stock_opname_skus ADD COLUMN IF NOT EXISTS reconciled_by integer;
ALTER TABLE stock_opname_skus ADD CONSTRAINT stock_opname_skus_reconciled_by_users_id_fk
  FOREIGN KEY (reconciled_by) REFERENCES users(id);

COMMIT;
