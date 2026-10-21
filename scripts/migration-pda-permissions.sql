-- PDA permissions (PDA tab on /permissions)
-- Run with: docker exec -it wms-db psql -U postgres -d wms_v2
-- Run this BEFORE deploying the new code: once deployed, a non-Manager role
-- with no rows here can't log in on the PDA or do any PDA operation.
-- Safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS role_pda_permissions (
  id serial PRIMARY KEY,
  role_id integer NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  pda_key text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS role_pda_permissions_role_key_idx
  ON role_pda_permissions (role_id, pda_key);

-- Give every PDA feature to every existing non-Manager role.
-- Untick what you don't want on /permissions → PDA tab afterwards.
-- Manager is skipped: it always has everything and needs no rows.
INSERT INTO role_pda_permissions (role_id, pda_key)
SELECT r.id, k.key
FROM roles r
CROSS JOIN (VALUES
  ('pda.inbound'),
  ('pda.pick'),
  ('pda.pickTambahan'),
  ('pda.ship'),
  ('pda.shipTambahan'),
  ('pda.outboundWh'),
  ('pda.checkSo'),
  ('pda.moveIn'),
  ('pda.move'),
  ('pda.stockOpname')
) AS k(key)
WHERE lower(r.name) <> 'manager'
ON CONFLICT (role_id, pda_key) DO NOTHING;

COMMIT;

-- Verify:
-- SELECT r.name, count(p.id) AS pda_features
--   FROM roles r LEFT JOIN role_pda_permissions p ON p.role_id = r.id
--  GROUP BY r.name ORDER BY r.name;
