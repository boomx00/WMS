// English text for the Stock Opname Plan modal. Spread into the stock_opname
// section of lib/pageLabels.ts through STOCK_OPNAME_SUMMARY_LABELS, so every
// key is translatable on Settings → Translations. Keep placeholders like {n}.

export const STOCK_OPNAME_PLAN_LABELS = {
  plan_button: "Stock Opname Plan",
  plan_title: "Stock Opname Plan",
  plan_intro:
    "Upload today's production and shipping plans to see which SKUs to count in each warehouse shift. Stock comes from Good Stock in the WMS, and SKUs already opnamed this week are left out.",
  plan_close: "Close",
  plan_date: "Plan date",
  plan_production_file: "Production plan",
  plan_shipping_file: "Shipping plan",
  plan_warehouse: "Warehouse",
  plan_generate: "Generate plan",
  plan_generating: "Generating…",
  plan_shift_a: "Shift A",
  plan_shift_b: "Shift B",
  plan_shift_c: "Shift C",
  plan_shift_a_hours: "08:00–16:00",
  plan_shift_b_hours: "16:00–24:00",
  plan_shift_c_hours: "24:00–08:00",
  plan_sku_count: "{n} SKU",
  plan_th_sku: "SKU",
  plan_th_stock: "Good Stock",
  plan_only_free_shift: "Only free shift",
  plan_empty_shift: "No SKUs in this shift.",
  plan_summary: "{n} SKUs to count · {skipped} skipped",
  plan_skipped: "Skipped SKUs",
  plan_skip_in_production: "In production in every shift",
  plan_skip_counted: "Already opnamed this week",
  plan_skip_other_orders: "Stand by, and on other sales orders",
  plan_warn_no_production: "The production plan has no rows for {date}, so production isn't blocking any SKU. Check you uploaded the right file.",
  plan_warn_shift_c: "Shift C has {n} SKU(s) with at least {stock} in stock. The target is {target}.",
  plan_err_no_files: "Choose both the production plan and the shipping plan.",
  plan_err_production: "Production plan: couldn't find the Date, Shift and PN columns.",
  plan_err_shipping: "Shipping plan: couldn't find the No. Doc, Nomor SKU and Status columns.",
  plan_err_generate: "Couldn't generate the plan",
} as const;
