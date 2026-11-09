// Shapes of the Combine CSO API response and the report built from it.

// packs: a packs location's column — its System / SO are loose packs.
export type ReportColumn = { key: string; label: string; packs?: boolean };

export type SystemLine = { itemId: number; sku: string; name: string; qty: number };

// One line of one session at a location. itemId null = confirmed empty.
export type CountLine = {
  opnameNumber: string;
  countedBy: string | null;
  itemId: number | null;
  sku: string | null;
  name: string | null;
  qty: number;
};

export type ReportLocation = {
  locationCode: string;
  column: string;
  allowsMultipleSku: boolean;
  opnamed: boolean;
  system: SystemLine[];
  counts: CountLine[];
};

export type CombinedItem = {
  itemId: number;
  sku: string;
  name: string;
  system: Record<string, number>; // per report column; missing = 0 (packs in a packs column)
  k3Qty: number | null; // null = not in the K3 file (0 in K3)
  packsPerCarton?: number; // turns a packs column into cartons for the totals
};

export type K3Info = {
  fileName: string | null;
  importedAt: string;
  by: string | null;
  sessions: string[];
  matchedSkus: number;
  totalQuantity: number;
  unmatched: { code: string; name: string | null; quantity: number }[];
};

export type CombineResponse = {
  opnameNumbers: string[];
  sessionCount: number;
  emptyConfirmations: number;
  rackCoverage: { total: number; opnamed: number; notOpnamed: number };
  columns: ReportColumn[];
  locations: ReportLocation[];
  items: CombinedItem[];
  k3: K3Info | null;
};

export type LocationStatus = "MATCH" | "QTY_MISMATCH" | "SKU_MISMATCH" | "UNDER_REVIEW" | "NOT_OPNAMED";

export type SkuStatus = "MATCH" | "MISMATCH" | "UNDER_REVIEW";

export type CountedBy = { opnameNumber: string; countedBy: string | null };

// The sessions to choose between where their results differ.
export type SessionChoice = {
  key: string; // into Selections
  options: (CountedBy & { detail: string })[];
};

// One row of the Location Check tab, with the session picks applied.
export type ReportRow = {
  key: string;
  locationCode: string;
  column: string;
  emptyConfirmed: boolean;
  system: SystemLine | null;
  so: { itemId: number; sku: string; name: string; qty: number | null } | null;
  by: CountedBy[];
  choice: SessionChoice | null;
  status: LocationStatus;
  reviewItemIds: number[]; // the SKUs whose totals wait on this row's pick
};

// One SKU on the SKU Summary tab, for the locations ticked.
export type SkuSummaryRow = {
  itemId: number;
  sku: string;
  name: string;
  system: Record<string, number>; // packs in a packs column
  so: Record<string, number>; // packs in a packs column
  totalSystem: number; // cartons — packs ÷ packs per carton (decimal)
  totalSo: number;
  difference: number;
  status: SkuStatus;
  k3: number | null; // null = no K3 file imported
  k3InFile: boolean;
  k3Delta: number | null;
};

// SessionChoice.key -> the session picked.
export type Selections = Record<string, string>;
