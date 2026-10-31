export type Session = {
  opnameNumber: string;
  notes: string | null;
  createdAt: string | Date;
  commencedAt: string | Date | null;
  completedAt: string | Date | null;           // ADD
  totalLines: number;
  countedLines: number;
  discrepancies: number;
  status: string;
  assignedToUsername: string | null;
  confirmedAt: string | Date | null;
  confirmDescription: string | null;
  confirmedAdjustmentCode: string | null;
  // Per-SKU (SOSKU-) sessions only — summed across every SKU in the session.
  isSkuSession: boolean;
  skuCount: number;
  skuLockedQty: number;
  skuCountedQty: number;
};

export type ReportItem = {
  itemId: number | null;
  itemSku: string | null;
  itemName: string;
  systemQty: number;
  systemSku: string;
  countedQty: number;
  difference: number;
  countedAt: string | null;
  countedByUsername: string | null;
  currentItemQty: number | null; // ADD
  skuMatch: "MATCH" | "MISMATCH";
};

export type ReportLocation = {
  locationCode: string;
  counted: boolean;
  currentSystemStock: { sku: string; name: string; quantity: number }[];
  currentSystemQty: number;
  items: ReportItem[];
};

export type ReportResponse = {
  opnameNumber: string;
  notes: string | null;
  assignedToUsername: string | null;
  totalLocations: number;
  countedLocations: number;
  report: ReportLocation[];
};
