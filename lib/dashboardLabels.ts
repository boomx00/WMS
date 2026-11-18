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

  card_orders_breakdown: "In progress {in_progress} · Total {total}",

  // Net Stock Growth chart
  growth_title: "Net Stock Growth",
  growth_info:
    "Inbound minus outbound for each office day (the same cartons as the Total Inbound and Total Outbound cards), and its running total over the days shown, counted from 0 on the first day. Above zero the warehouse took in more than it sent out; below zero it sent out more.",
  growth_range: "{n}D",
  growth_range_hint: "Last {n} office days, ending on the day shown",
  growth_cumulative: "Cumulative",
  growth_daily_net: "Daily net",
  growth_inbound: "Inbound",
  growth_outbound: "Outbound",
  growth_net: "Net",
  growth_empty: "No inbound or outbound in these days.",
  growth_load_failed: "Failed to load the growth chart",

  // Sales Orders (in progress + finished)
  orders_title: "Sales Orders",
  orders_info:
    "In Progress: every sales order that has started picking and isn't completed yet, whichever office day is open. Finished: fully shipped, with the last shipping in this office day. Time needed runs from the first picking to the last shipping (including Tambahan shipments); for orders in progress it's the time so far.",
  summary_total: "Total",
  status_in_progress: "In Progress",
  status_finished: "Finished",
  th_document: "Document No.",
  th_status: "Status",
  th_first_pick: "First Picking",
  th_last_ship: "Last Shipping",
  th_time_needed: "Time Needed",
  th_cartons: "Cartons Shipped",
  time_so_far: "Time so far",

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