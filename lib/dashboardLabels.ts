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

  card_production_in: "In from Production",
  card_other_in: "Other Inbound",
  card_shipped: "Shipped (Sales Orders)",
  card_other_out: "Other Outbound",
  cartons: "cartons",

  section_inbound: "Inbound",
  section_outbound: "Outbound",
  production_title: "From Production",
  other_in_title: "Other Inbound",
  shipped_title: "Sales Orders",
  other_out_title: "Other Outbound",

  th_mo: "MO Number",
  th_sku: "SKU",
  th_product: "Product Name",
  th_qty: "Qty",
  th_details: "Details",
  th_so: "Sales Order",
  th_transaction: "Transaction",
  th_note: "Note",
  details_button: "Details",
  total: "Total",

  empty: "Nothing in this office day.",
  no_results: "Nothing matches your search.",
  future_day: "This office day hasn't started yet.",
  modal_shipped_title: "Sales orders that shipped {sku}",
  modal_other_title: "Transactions for {sku}",
  close: "Close",
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
