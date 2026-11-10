-- Units of measure and product categories (Items page → Units / Categories).
-- Phase 1 of configurable units: this only adds the tables and gives every
-- product a category. Stock is NOT converted — quantities stay in cartons
-- (location_stock.quantity) and loose packs (loose_packs) as before.
--
-- Run BEFORE deploying the new code. Safe to run more than once:
--   docker exec -i wms-db psql -U postgres -d wms_v2 < scripts/migration-units-categories.sql

BEGIN;

-- 1. Units ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS units (
  id serial PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  name_id text,
  name_zh text,
  decimals integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT units_decimals_range CHECK (decimals BETWEEN 0 AND 3)
);

-- "CTN" and "ctn" are the same unit.
CREATE UNIQUE INDEX IF NOT EXISTS units_code_idx ON units (lower(code));

INSERT INTO units (code, name, name_id, name_zh, decimals, sort_order) VALUES
  ('CTN', 'Carton', 'Karton', '箱',   0, 1),
  ('PK',  'Pack',   'Pak',    '包',   0, 2),
  ('PLT', 'Pallet', 'Palet',  '托盘', 0, 3)
ON CONFLICT (lower(code)) DO NOTHING;

-- 2. Product categories ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_categories (
  id serial PRIMARY KEY,
  name text NOT NULL,
  primary_unit_id integer NOT NULL
    CONSTRAINT product_categories_primary_unit_id_units_id_fk REFERENCES units(id) ON DELETE RESTRICT,
  secondary_unit_id integer
    CONSTRAINT product_categories_secondary_unit_id_units_id_fk REFERENCES units(id) ON DELETE RESTRICT,
  default_ratio integer,
  storage_unit_id integer
    CONSTRAINT product_categories_storage_unit_id_units_id_fk REFERENCES units(id) ON DELETE RESTRICT,
  default_storage_qty integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT product_categories_units_differ CHECK (
        secondary_unit_id IS DISTINCT FROM primary_unit_id
    AND storage_unit_id   IS DISTINCT FROM primary_unit_id
    AND (storage_unit_id IS NULL OR storage_unit_id IS DISTINCT FROM secondary_unit_id)
  ),
  CONSTRAINT product_categories_default_ratio_positive CHECK (default_ratio IS NULL OR default_ratio > 0),
  CONSTRAINT product_categories_default_storage_qty_positive CHECK (default_storage_qty IS NULL OR default_storage_qty > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_categories_name_idx ON product_categories (lower(name));

-- 3. Each product's category -------------------------------------------------------

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS category_id integer
  CONSTRAINT items_category_id_product_categories_id_fk REFERENCES product_categories(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS items_category_idx ON items (category_id);

-- 4. Seed categories from the products' Type ----------------------------------------
-- One category per Type in use ("Diapers", ...), ignoring case and spaces,
-- plus "Finished Goods" for products with no Type. All are Carton / Pack /
-- Pallet — what the warehouse uses today. The default ratio and storage qty
-- are the most common packs per carton and cartons per pallet in that Type.
-- Categories that already exist are left alone.

INSERT INTO product_categories (name, primary_unit_id, secondary_unit_id, default_ratio, storage_unit_id, default_storage_qty)
SELECT min(btrim(i.product_type)),
       (SELECT id FROM units WHERE lower(code) = 'ctn'),
       (SELECT id FROM units WHERE lower(code) = 'pk'),
       mode() WITHIN GROUP (ORDER BY i.carton_bag_qty),
       (SELECT id FROM units WHERE lower(code) = 'plt'),
       mode() WITHIN GROUP (ORDER BY i.pallet_carton_qty)
  FROM items i
 WHERE coalesce(btrim(i.product_type), '') <> ''
 GROUP BY lower(btrim(i.product_type))
ON CONFLICT (lower(name)) DO NOTHING;

INSERT INTO product_categories (name, primary_unit_id, secondary_unit_id, default_ratio, storage_unit_id, default_storage_qty)
SELECT 'Finished Goods',
       (SELECT id FROM units WHERE lower(code) = 'ctn'),
       (SELECT id FROM units WHERE lower(code) = 'pk'),
       mode() WITHIN GROUP (ORDER BY i.carton_bag_qty),
       (SELECT id FROM units WHERE lower(code) = 'plt'),
       mode() WITHIN GROUP (ORDER BY i.pallet_carton_qty)
  FROM items i
 WHERE coalesce(btrim(i.product_type), '') = ''
HAVING count(*) > 0
ON CONFLICT (lower(name)) DO NOTHING;

-- 5. Backfill: each product gets the category of its Type --------------------------
-- Products that already have a category are not touched.

UPDATE items i
   SET category_id = c.id
  FROM product_categories c
 WHERE i.category_id IS NULL
   AND lower(c.name) = lower(coalesce(nullif(btrim(i.product_type), ''), 'Finished Goods'));

COMMIT;

-- 6. Check ------------------------------------------------------------------------

SELECT c.name                       AS category,
       pu.code                      AS primary_unit,
       su.code                      AS secondary_unit,
       c.default_ratio,
       stu.code                     AS storage_unit,
       c.default_storage_qty,
       count(i.id)                  AS products
  FROM product_categories c
  JOIN units pu       ON pu.id  = c.primary_unit_id
  LEFT JOIN units su  ON su.id  = c.secondary_unit_id
  LEFT JOIN units stu ON stu.id = c.storage_unit_id
  LEFT JOIN items i   ON i.category_id = c.id
 GROUP BY c.id, pu.code, su.code, stu.code
 ORDER BY c.name;

-- Should be 0:
SELECT count(*) AS products_without_category FROM items WHERE category_id IS NULL;

-- Products whose packs per carton look wrong (worth fixing before Phase 2,
-- which will multiply stock by this number):
SELECT sku, name, carton_bag_qty AS packs_per_carton
  FROM items
 WHERE carton_bag_qty <= 1
 ORDER BY sku;
