-- Dashboard + Office Hour
-- Run with: docker exec -i wms-db psql -U postgres -d wms_v2 < scripts/migration-dashboard-office-hour.sql

BEGIN;

-- 1. Office hour (Settings → General): when the Dashboard's office day
--    starts, in minutes after midnight WIB. 420 = 07:00, so each day runs
--    07:00 → 07:00 the next day.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS office_day_start_minutes integer NOT NULL DEFAULT 420;

-- 2. The heat map moved from "/" to "/heatmap", and "/" is now the
--    Dashboard. Roles that could open the old home page ("/") keep the
--    heat map by getting "/heatmap" too. (Manager sees everything anyway.)
INSERT INTO role_page_permissions (role_id, page_path)
SELECT role_id, '/heatmap'
FROM role_page_permissions
WHERE page_path = '/'
ON CONFLICT (role_id, page_path) DO NOTHING;

COMMIT;
