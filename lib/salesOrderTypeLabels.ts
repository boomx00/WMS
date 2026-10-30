// English text for the sales order document type screens, used when these
// keys haven't been added to lib/pageLabels.ts yet (usePageLabels'
// fallbacks), so nothing renders blank. Keys added to pageLabels.ts take
// over and become editable on Settings → Translations.

// navbar
export const SO_TYPE_NAVBAR_LABELS: Record<string, string> = {
  sales_order_list: "Sales Order List",
  sales_order_types: "Sales Order Types",
};

// sales_page — the Sales Orders page, its create / edit forms, and the
// Sales Order Types page
export const SO_TYPE_SALES_PAGE_LABELS: Record<string, string> = {
  document_type: "Document Type",
  choose_document_type: "Choose type...",
  no_document_types: "No document types yet — add one on Sales Order Types first.",
  no_type: "No type",
  filter_all: "All",
  number_after_prefix: "Number",
  so_number_preview: "SO number: {so}",
  truck_times_note: "Truck Enter = first pick · Truck Leave = last ship",
  save_changes: "Save Changes",
  saving: "Saving...",

  types_header: "Sales Order Types",
  types_description:
    "Document types a sales order can be, e.g. SO or HPT. Every new sales order picks one, and Analytics can filter by them.",
  types_read_only: "Read-only — your role can't add or edit sales order types.",
  type_name: "Name",
  type_description: "Description (optional)",
  type_number_prefix: "SO Number Prefix",
  type_number_prefix_placeholder: "e.g. SO- or HPT",
  type_number_prefix_hint:
    "The fixed start of this type's SO numbers. New sales orders of this type only need the number after it.",
  type_orders: "Sales Orders",
  add_type: "Add Type",
  types_empty: "No types yet.",
  type_confirm_delete: 'Delete the type "{name}"?',
  type_in_use: "Used by {n} sales order(s) — change their type first.",
};

// analytics — Sales Orders Shipped panel
export const SO_TYPE_ANALYTICS_LABELS: Record<string, string> = {
  document_types: "Document Types",
  no_type: "No type",
  select_all: "All",
  select_none: "None",
  th_type: "Type",
  no_sales_orders_for_types: "No sales orders of the ticked types in this range.",
};
