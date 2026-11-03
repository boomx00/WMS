-- Stock Opname cycle (Settings → General): how long a SKU stays "already
-- opnamed" for the Stock Opname Plan.
-- Run with: docker exec -i wms-db psql -U postgres -d wms_v2 < scripts/migration-opname-cycle.sql

BEGIN;

-- WEEKLY: start day 1 (Monday) to 7 (Sunday).
-- MONTHLY: start day 1 to 31 (in shorter months, the last day of the month).
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS opname_cycle_type text NOT NULL DEFAULT 'WEEKLY'
    CHECK (opname_cycle_type IN ('WEEKLY', 'MONTHLY')),
  ADD COLUMN IF NOT EXISTS opname_cycle_start_day integer NOT NULL DEFAULT 1
    CHECK (opname_cycle_start_day BETWEEN 1 AND 31);

COMMIT;
