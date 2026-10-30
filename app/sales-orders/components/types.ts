export type ItemOption = { sku: string; name: string };

// A sales order document type (SO, HPT, ...) — Sales Order Types page.
export type SalesOrderTypeOption = {
  id: number;
  name: string;
  description: string | null;
  // Fixed start of this type's SO numbers, e.g. "SO/MDE-"; null = none.
  numberPrefix: string | null;
};

export type PickSource = { locationCode: string; quantity: number; type: string; username: string };
export type ShippedBy = { username: string; quantity: number };

export type OrderLine = {
  quantity: number;
  itemSku: string;
  itemName: string;
  itemId: number;
  palletCartonQty: number;
  shipped: number;
  picked: number;
  status: "PENDING" | "PICKING" | "SHIPPED";
  pickedFrom: PickSource[];
  shippedBy: ShippedBy[];
};

export type Order = {
  id: number;
  soNumber: string;
  orderDate: string | Date;
  createdAt: string | Date;
  items: OrderLine[];
  overallStatus: "COMPLETE" | "PARTIAL" | "NOT_STARTED";
  pickedByUsers: string[];
  finishedAt: string | Date | null;
  salesOrderTypeId: number | null;
  // Worked out from the ledger (lib/truckTimes.ts): first pick / last ship,
  // as WIB wall-clock strings. Read-only.
  truckEnterTime: string  | null;
  truckLeaveTime: string  | null;
};