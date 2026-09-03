// Default English text per page, keyed by a stable identifier per string.
// A page's customizable strings are exactly the keys listed here — adding
// a new customizable page/string later just means adding an entry here
// and using usePageLabels(page).key wherever that string is rendered.
export const DEFAULT_LABELS = {
  stock_opname: {
    th_location: "Location",
    th_counted_sku: "Counted SKU",
    th_system_sku_at_count: "System SKU (at Count)",
    th_sku_match: "SKU Match",
    th_counted_qty: "Counted SKU Qty",
    th_system_qty_at_count: "System SKU Qty (at Count)",
    th_difference: "Difference",
    th_current_system_sku: "Current System SKU",
    th_current_system_qty: "Current System Qty",
    th_by: "By",
  },
  location_stock: {
    th_location: "Location",
    th_sku: "SKU",
    th_product: "Product",
    th_quantity: "Quantity",
    th_updated: "Updated",
    search_placeholder: "Search all location stock by location or SKU ..."
  },
  scan: {
    th_inbound: "Inbound",
    th_adjust: "Adjust Location",
    th_correct: "Adjust Pallet Qty",
  },
  navbar: {
    inventory: "Inventory",
    location_stock: "Location Stock",
    sales_order: "Sales Order",
    movement_history: "Movement History",
    work_order: "Work order",
    system_control: "System Control",
    analytics: "Analytics",
    stock_opname: "Stock Opname",
    settings: "settings",
    master_data: "Master Data",
    items: "Product List",
    locations: "Location List",
    users: "User List",
    roles: "Roles List"
  }
} as const;

export type PageKey = keyof typeof DEFAULT_LABELS;
export type LabelKey<P extends PageKey> = keyof (typeof DEFAULT_LABELS)[P];

export const PAGE_OPTIONS: { key: PageKey; label: string }[] = [
    { key: "navbar", label: "NavBar"},
    { key: "stock_opname", label: "Stock Opname" }, 
    { key: "location_stock", label: "Location Stock (v2)"},
    { key: "scan", label: "System Control"}
    
];

export type Language = "en" | "id" | "zh";

export const LANGUAGE_OPTIONS: { code: Language; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "id", label: "ID" },
  { code: "zh", label: "中文" },
];