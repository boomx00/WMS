-- CSO Summaries (Stock Opname → Verify Stock Integrity → CSO Summary):
-- a named stock opname activity that locks the whole system stock when it is
-- created, so its CSO sessions are compared against that locked stock.
-- Run with: docker exec -i wms-db psql -U postgres -d wms_v2 < scripts/migration-cso-summaries.sql

BEGIN;

CREATE TABLE IF NOT EXISTS cso_summaries (
  id             serial PRIMARY KEY,
  name           text NOT NULL,
  created_by     integer REFERENCES users(id),
  created_at     timestamp NOT NULL DEFAULT now(),
  opname_numbers jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS cso_summary_stock (
  id          serial PRIMARY KEY,
  summary_id  integer NOT NULL REFERENCES cso_summaries(id) ON DELETE CASCADE,
  location_id integer NOT NULL REFERENCES locations(id),
  item_id     integer NOT NULL REFERENCES items(id),
  quantity    numeric(14, 3) NOT NULL DEFAULT 0,
  loose_packs integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS cso_summary_stock_summary_idx ON cso_summary_stock (summary_id);

COMMIT;
