// English text for the Dashboard ("/") and its Office Hour setting.
// DASHBOARD_LABELS is the `dashboard_page` entry of DEFAULT_LABELS in
// lib/pageLabels.ts, so every string is editable on Settings → Translations.
// The Office Hour keys on settings_page are passed as usePageLabels
// fallbacks (same as lib/salesOrderTypeLabels.ts) until they're added there.

export const DASHBOARD_LABELS = {
  page_header: "Dashboard",
  header_description: "Cartons in and out of the warehouse for one office day",
  office_day: "Office day",
  today: "Today",
  previous_day: "Previous day",
  next_day: "Next day",
  window_until_now: "now",
  updated_at: "Updated {time}",
  search_placeholder: "Search SKU, product, MO, SO or transaction code...",

  card_total_in: "Total Inbound",
  card_total_out: "Total Outbound",
  card_skus_moved: "SKUs Moved",
  card_completed: "Sales Orders Completed",
  card_in_breakdown: "Production {production} · Other {other}",
  card_out_breakdown: "Sales Orders {sales} · Other {other}",
  cartons: "cartons",
  orders: "orders",

  // Inbound / Outbound tables
  inbound_title: "Inbound",
  outbound_title: "Outbound",
  sort_hint: "Click to sort",
  th_sku: "SKU",
  th_product: "Product Name",
  th_production: "Production",
  th_other: "Other",
  th_sales_orders: "Sales Orders",
  th_total: "Total",
  th_details: "Details",
  details_button: "Details",
  total: "Total",

  // Details modal
  modal_inbound_title: "Inbound of {sku}",
  modal_outbound_title: "Outbound of {sku}",
  th_reference: "Reference",
  th_note: "Note",
  th_qty: "Qty",
  kind_mo: "MO",
  kind_so: "SO",
  kind_tambahan: "Tambahan",
  kind_other: "Other Transaction",
  modal_none: "None",
  close: "Close",

  // Sales Orders Completed
  completed_title: "Sales Orders Completed",
  completed_info:
    "Time needed is measured from the first picking to the last shipping of the sales order (including its Tambahan shipments). Listed here when the order is fully shipped and its last shipping falls in this office day.",
  th_document: "Document No.",
  th_first_pick: "First Picking",
  th_last_ship: "Last Shipping",
  th_time_needed: "Time Needed",
  th_cartons: "Cartons",

  empty: "Nothing in this office day.",
  no_results: "Nothing matches your search.",
  future_day: "This office day hasn't started yet.",
  loading: "Loading...",
  load_failed: "Failed to load the dashboard",
} as const;

export const OFFICE_HOUR_SETTINGS_LABELS: Record<string, string> = {
  office_hour: "Office Hour",
  office_hour_description:
    "When the Dashboard's office day starts (WIB). Each day runs from this time to the same time the next day — e.g. 07:00 → 07:00, so at 04:00 the Dashboard still shows the previous day's shift.",
  office_hour_next_day: "next day",
  office_hour_saved: "Saved",
};
