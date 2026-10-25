export type ItemOption = { sku: string; name: string };

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
  truckEnterTime: string  | null;
  truckLeaveTime: string  | null;
};