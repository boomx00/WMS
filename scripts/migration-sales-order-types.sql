-- Sales order document types (Sales Orders → Sales Order Types), the
-- document type of each sales order, the SO / HPT seed types, and the
-- backfill of existing sales orders.
-- Run BEFORE deploying the new code. Safe to run more than once (also if an
-- earlier version of this file was already run):
--   docker exec -i wms-db psql -U postgres -d wms_v2 < scripts/migration-sales-order-types.sql
--
-- Truck enter / leave need no migration: they're worked out from
-- location_stock_events (first pick / last ship, incl. Tambahan ships) for
-- every SO, old and new. The old truck_enter_time / truck_leave_time
-- columns are left in place, unused.

BEGIN;

-- 1. Types ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sales_order_types (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Fixed start of the type's SO numbers ("SO-"); the create form puts it
-- in front of the typed number. Null = the whole number is typed.
ALTER TABLE sales_order_types ADD COLUMN IF NOT EXISTS number_prefix text;

-- "SO" and "so" are the same type.
CREATE UNIQUE INDEX IF NOT EXISTS sales_order_types_name_idx
  ON sales_order_types (lower(name));

-- 2. Each sales order's type ---------------------------------------------------

-- Null for sales orders no type could be found for.
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS sales_order_type_id integer
  REFERENCES sales_order_types(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS sales_orders_type_idx
  ON sales_orders (sales_order_type_id);

-- 3. Seed SO, HPT and MDE ----------------------------------------------------
-- SO numbers look like "SO-202610000658" and "HPT202610000506": the type,
-- then the number (SO with a dash, HPT without).
-- Existing types with these names are kept; only a missing prefix is filled,
-- or a prefix an earlier version of this file seeded ("SO/MDE-",
-- "HPT/MDE-", "HPT-") is corrected.

INSERT INTO sales_order_types (name, description, number_prefix) VALUES
  ('SO',  'Sales Order', 'SO-'),
  ('HPT', 'HPT',         'HPT'),
  ('MDE', 'MDE',         'MDE-')
ON CONFLICT DO NOTHING;

UPDATE sales_order_types SET number_prefix = 'SO-'
 WHERE lower(name) = 'so'  AND (number_prefix IS NULL OR number_prefix = 'SO/MDE-');
UPDATE sales_order_types SET number_prefix = 'HPT'
 WHERE lower(name) = 'hpt' AND (number_prefix IS NULL OR number_prefix IN ('HPT/MDE-', 'HPT-'));
UPDATE sales_order_types SET number_prefix = 'MDE-'
 WHERE lower(name) = 'mde' AND number_prefix IS NULL;

-- 4. Backfill existing sales orders ---------------------------------------------
-- Numbers are compared with everything but letters and digits removed
-- (dashes, slashes, spaces, and invisible characters such as non-breaking
-- spaces) and ignoring case, so "SO-202610000658", "HPT202610000506",
-- "hpt/0004", "MDE 0001" and " SO-…" (hidden leading space) all match.
-- An untyped SO gets the type whose name is the run of LETTERS its number
-- starts with ("HPT202610000506" → "hpt"; "SOX-1" is not SO), or else the
-- type whose prefix, exactly as written, its number starts with (for types
-- whose prefix has digits or other characters in it). Longest prefix wins.
-- SOs that already have a type are not touched.

UPDATE sales_orders so
   SET sales_order_type_id = (
     SELECT t.id
       FROM sales_order_types t,
            LATERAL (SELECT lower(regexp_replace(so.so_number, '[^A-Za-z0-9]', '', 'g')) AS n,
                            lower(btrim(regexp_replace(so.so_number, '[\u00A0\u200B\u200C\u200D\uFEFF]', '', 'g'))) AS raw) x
      WHERE substring(x.n from '^[a-z]+') = lower(t.name)
         OR (t.number_prefix IS NOT NULL AND btrim(t.number_prefix) <> ''
             AND left(x.raw, length(btrim(t.number_prefix))) = lower(btrim(t.number_prefix)))
      ORDER BY (substring(x.n from '^[a-z]+') = lower(t.name)) DESC,
               length(coalesce(t.number_prefix, '')) DESC, t.id
      LIMIT 1
   )
 WHERE so.sales_order_type_id IS NULL;

COMMIT;

-- 5. What's left untyped (shown as "No type"; pick a type via Edit, or add
--    the missing type on Sales Order Types and run this file again) -----------

SELECT substring(lower(regexp_replace(so_number, '[^A-Za-z0-9]', '', 'g')) from '^[a-z]*') AS starts_with,
       count(*)                      AS untyped_sales_orders,
       min(so_number)                AS example
  FROM sales_orders
 WHERE sales_order_type_id IS NULL
 GROUP BY 1
 ORDER BY 2 DESC;

SELECT t.name, t.number_prefix, count(so.id) AS sales_orders
  FROM sales_order_types t
  LEFT JOIN sales_orders so ON so.sales_order_type_id = t.id
 GROUP BY t.id
 ORDER BY t.name;
