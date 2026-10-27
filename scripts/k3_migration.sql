CREATE TABLE k3_stock_imports (
  id serial PRIMARY KEY,
  warehouse_id integer NOT NULL,
  stock_date date NOT NULL,
  file_name text,
  good_stock_rows integer NOT NULL DEFAULT 0,
  unmatched jsonb NOT NULL DEFAULT '[]'::jsonb,
  imported_by integer,
  imported_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT k3_stock_imports_warehouse_id_warehouses_id_fk
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
  CONSTRAINT k3_stock_imports_imported_by_users_id_fk
    FOREIGN KEY (imported_by) REFERENCES users(id)
);
CREATE UNIQUE INDEX k3_stock_imports_warehouse_date_idx ON k3_stock_imports (warehouse_id, stock_date);

CREATE TABLE k3_stock_lines (
  id serial PRIMARY KEY,
  import_id integer NOT NULL,
  item_id integer NOT NULL,
  quantity numeric(14,3) NOT NULL,
  CONSTRAINT k3_stock_lines_import_id_k3_stock_imports_id_fk
    FOREIGN KEY (import_id) REFERENCES k3_stock_imports(id) ON DELETE CASCADE,
  CONSTRAINT k3_stock_lines_item_id_items_id_fk
    FOREIGN KEY (item_id) REFERENCES items(id)
);
CREATE UNIQUE INDEX k3_stock_lines_import_item_idx ON k3_stock_lines (import_id, item_id);
