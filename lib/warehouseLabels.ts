// English text for the warehouse (parent location) screens, used when these
// keys haven't been added to lib/pageLabels.ts yet (usePageLabels'
// fallbacks), so nothing renders blank. Keys added to pageLabels.ts take
// over and become editable on Settings → Translations.

export const LOCATIONS_WAREHOUSE_LABELS: Record<string, string> = {
  tab_warehouses: "Warehouses",
  warehouses_description:
    "Parent locations, e.g. Finished Goods and Raw Material. Every location belongs to one. Each warehouse gets its own Total Stock tab and columns, and its own PDA defaults. The first active one is the default.",
  search_warehouses_placeholder: "Search warehouses by name...",
  th_warehouse: "Warehouse",
  th_default_receiving: "Default receiving",
  th_default_staging: "Default staging",
  th_status: "Status",
  field_warehouse: "Warehouse",
  filter_all_warehouses: "All warehouses",
  warehouse_name: "Warehouse name",
  btn_add_warehouse: "Add Warehouse",
  modal_add_warehouse: "Add warehouse",
  modal_edit_warehouse: "Edit warehouse",
  field_warehouse_active: "Active",
  hint_warehouse_active:
    "Inactive warehouses aren't offered on the PDA and can't get new locations. Their locations and stock stay, and still show on the web.",
  hint_warehouse_default:
    "This is the default warehouse (first active one in the list) — older scanners use it. To deactivate it, move another active warehouse above it first.",
  status_active: "Active",
  status_inactive: "Inactive",
  warehouse_inactive_suffix: "(inactive)",
  warehouse_delete: "Delete warehouse",
  warehouse_move_up: "Move up",
  warehouse_move_down: "Move down",
  warehouse_default_badge: "Default",
  warehouse_confirm_delete: 'Delete the warehouse "{name}"? Its Total Stock columns are deleted too.',
  warehouse_in_use: "Has {n} location(s), so it can't be deleted — deactivate it instead, or move its locations first.",
  warehouse_last: "There has to be at least one warehouse.",
  hint_warehouse_columns: "Each warehouse has its own Total Stock columns.",
};

export const TOTAL_STOCK_WAREHOUSE_LABELS: Record<string, string> = {
  warehouse_tabs: "Warehouses",
  warehouse_inactive: "Inactive",
};

export const LOCATION_STOCK_WAREHOUSE_LABELS: Record<string, string> = {
  warehouse_filter: "Warehouse",
  all_warehouses: "All warehouses",
  warehouse_inactive_suffix: "(inactive)",
};

export const SETTINGS_WAREHOUSE_LABELS: Record<string, string> = {
  stock_columns_warehouse: "Warehouse",
  warehouse_inactive_suffix: "(inactive)",
};
