-- Decimal stock quantities: every stock quantity column can hold up to 3
-- decimal places, so a product counted in Kilogram can hold 12.5.
-- Existing numbers are unchanged (120 stays 120). How many decimals a
-- product may actually use is its unit's "Decimals" on Items page → Units
-- (Carton / Pack stay 0).
--
-- Run AFTER scripts/migration-units-categories.sql and BEFORE deploying the
-- new code. The two big tables (location_stock_events, stock_opname_items)
-- are rewritten, which locks them for a moment — run it with operations
-- frozen or outside shift hours. Safe to run more than once.
--   docker exec -i wms-db psql -U postgres -d wms_v2 < scripts/migration-decimal-quantities.sql
--
-- Not changed: loose packs (always whole packs) and the old v1 pallet tables.

BEGIN;

-- Each column only when it's still a whole-number type, so re-running is a no-op.
DO $$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN (VALUES
        ('location_stock',            'quantity'),
        ('location_stock_events',     'quantity'),
        ('shipment_revisions',        'quantity'),
        ('sales_order_items',         'quantity'),
        ('other_transactions',        'quantity'),
        ('bulk_adjustment_lines',     'previous_quantity'),
        ('bulk_adjustment_lines',     'new_quantity'),
        ('bulk_adjustment_lines',     'delta'),
        ('stock_opname_skus',         'system_qty'),
        ('stock_opname_skus',         'reconcile_plus'),
        ('stock_opname_skus',         'reconcile_minus'),
        ('stock_opname_items',        'system_qty'),
        ('stock_opname_items',        'counted_qty'),
        ('stock_opname_items',        'difference'),
        ('stock_opname_count_events', 'delta'),
        ('item_ledger_anchors',       'opening_quantity')
      ) AS want(table_name, column_name)
        ON want.table_name = c.table_name AND want.column_name = c.column_name
     WHERE c.table_schema = 'public'
       AND c.data_type IN ('integer', 'bigint', 'smallint')
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE numeric(14,3)', col.table_name, col.column_name);
    RAISE NOTICE 'decimal: %.%', col.table_name, col.column_name;
  END LOOP;
END $$;

-- Units can have at most 3 decimals now (the columns hold 3).
UPDATE units SET decimals = 3 WHERE decimals > 3;
ALTER TABLE units DROP CONSTRAINT IF EXISTS units_decimals_range;
ALTER TABLE units ADD CONSTRAINT units_decimals_range CHECK (decimals BETWEEN 0 AND 3);

-- A Kilogram unit to start with (rename or delete it on Items page → Units).
INSERT INTO units (code, name, name_id, name_zh, decimals, sort_order)
VALUES ('KG', 'Kilogram', 'Kilogram', '公斤', 3, (SELECT coalesce(max(sort_order), 0) + 1 FROM units))
ON CONFLICT (lower(code)) DO NOTHING;

-- Safety net: location_stock (the stock itself) refuses a quantity with
-- more decimals than the product's unit allows — 2.5 for a Carton product —
-- whichever screen or scanner sends it. Products with no category count in
-- whole numbers. The web shows a clearer message before it gets here.
CREATE OR REPLACE FUNCTION location_stock_check_decimals() RETURNS trigger AS $$
DECLARE
  allowed integer;
  sku text;
BEGIN
  IF NEW.quantity = trunc(NEW.quantity) THEN
    RETURN NEW;
  END IF;
  SELECT coalesce(u.decimals, 0), i.sku INTO allowed, sku
    FROM items i
    LEFT JOIN product_categories c ON c.id = i.category_id
    LEFT JOIN units u ON u.id = c.primary_unit_id
   WHERE i.id = NEW.item_id;
  IF NEW.quantity <> round(NEW.quantity, coalesce(allowed, 0)) THEN
    RAISE EXCEPTION 'Quantity % for % has more decimals than its unit allows (%)', NEW.quantity, sku, coalesce(allowed, 0)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS location_stock_check_decimals ON location_stock;
CREATE TRIGGER location_stock_check_decimals
  BEFORE INSERT OR UPDATE OF quantity ON location_stock
  FOR EACH ROW EXECUTE FUNCTION location_stock_check_decimals();

COMMIT;

-- Check: every column below should say numeric.
SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND (table_name, column_name) IN (
     ('location_stock','quantity'), ('location_stock_events','quantity'),
     ('shipment_revisions','quantity'), ('sales_order_items','quantity'),
     ('other_transactions','quantity'), ('bulk_adjustment_lines','previous_quantity'),
     ('bulk_adjustment_lines','new_quantity'), ('bulk_adjustment_lines','delta'),
     ('stock_opname_skus','system_qty'), ('stock_opname_skus','reconcile_plus'),
     ('stock_opname_skus','reconcile_minus'), ('stock_opname_items','system_qty'),
     ('stock_opname_items','counted_qty'), ('stock_opname_items','difference'),
     ('stock_opname_count_events','delta'), ('item_ledger_anchors','opening_quantity'))
 ORDER BY table_name, column_name;
