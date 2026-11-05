-- Operations Freeze (Settings → General): while true, API routes that change
-- stock are refused (lib/operationsFreeze.ts).
-- Run this BEFORE deploying the code:
--   docker exec -i wms-db psql -U postgres -d wms_v2 < scripts/migration-operations-freeze.sql
-- PowerShell, local:
--   Get-Content scripts\migration-operations-freeze.sql | docker exec -i wms-db psql -U postgres -d wms_v2

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS operations_frozen boolean NOT NULL DEFAULT false;
