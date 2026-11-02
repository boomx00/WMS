// Shapes of the Stock Opname Summary API responses and the panel's own state.

export type Figures = { system: number; counted: number };

// nameId / nameZh: a Total Stock column's Indonesian / Chinese names.
export type Bucket = { key: string; name: string; nameId?: string | null; nameZh?: string | null };

export type Status = "IN_PROGRESS" | "DONE" | "CONFIRMED";

export type Cell = {
  opnameNumber: string;
  lockedAt: string;
  status: Status;
  by: string | null;
  buckets: Record<string, Figures>;
  unaccounted: number;
  // Set with the "Adj" checkbox: the bulk adjustment made for this opname.
  adjustment: Adjustment | null;
  // The report's Reconciliation (+ / − on the Total SO); null while both are 0.
  reconciliation?: Reconciliation | null;
};

export type Reconciliation = { plus: number; minus: number; at: string | null; by: string | null };

// Free text typed in the Adj field (not linked to a bulk adjustment).
export type Adjustment = { note: string; at: string | null; by: string | null };

// The opname line (one SOSKU session of one SKU) the Adj popup is editing.
export type AdjustTarget = {
  itemId: number;
  sku: string;
  name: string;
  date: string;
  opnameNumber: string;
  current: Adjustment | null;
};

// A K3 (main system) import: Good Stock per product, read from K3's
// "Real-time Inventory" export that one PIC pulled, used by the SOSKU
// sessions it was imported for.
export type K3Import = {
  id?: number;
  date: string;
  sessions: string[]; // the SOSKU sessions using it
  fileName: string | null;
  importedAt: string;
  by: string | null;
  goodStockRows: number;
  matchedSkus: number;
  totalQuantity: number;
  unmatched: { code: string; name: string | null; quantity: number }[]; // codes not in WMS
  k3Warehouse?: string; // the K3 warehouse that was imported (in the import response only)
};

export type SummaryResponse = {
  warehouse: { id: number; name: string };
  warehouses: { id: number; name: string; isActive: boolean }[];
  buckets: Bucket[];
  dates: string[];
  k3Sessions?: Record<string, number>; // SOSKU session -> its K3 import's id
  k3Imports?: Record<string, K3Import>; // import id -> import
  items: {
    itemId: number;
    sku: string;
    name: string;
    currentStock: number;
    // cells[date] = every SOSKU session of that product that day, oldest first.
    cells: Record<string, Cell[]>;
    // k3[importId] = K3 Good Stock in that import; missing = not in the
    // K3 file, i.e. 0.
    k3?: Record<string, number>;
  }[];
};

export type DetailLine = {
  locationCode: string;
  bucket: string;
  systemQty: number;
  countedQty: number;
  countedAt: string | null;
  countedBy: string | null;
};

export type DetailEntry = Cell & { date: string; lines: DetailLine[] };

export type DetailResponse = {
  item: { itemId: number; sku: string; name: string };
  buckets: Bucket[];
  entries: DetailEntry[];
};

// Table sort: by SKU (A→Z first) or by current Total Stock (highest first).
// A third click on the same header goes back to the API's order.
export type SortKey = "sku" | "stock";

export type Sort = { key: SortKey; dir: "asc" | "desc" } | null;

// One SOSKU session of a date, as listed in the Import K3 window.
export type DateSession = {
  opnameNumber: string;
  by: string | null;
  status: Status;
  skus: number;
  firstAt: string;
  lastAt: string;
};

export type ReportFilterKey = "sku" | "product" | "status" | "sosku";
