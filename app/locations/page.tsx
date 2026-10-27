import { db } from "@/lib/db";
import { listLocationsForAdmin, listLocationTypesWithCounts } from "@/lib/locationAdmin";
import { getStockColumns } from "@/lib/stockColumns";
import { listWarehousesWithCounts } from "@/lib/warehouses";
import LocationsView from "./LocationsView";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const [types, locations, columns, warehouses] = await Promise.all([
    listLocationTypesWithCounts(db),
    listLocationsForAdmin(db),
    getStockColumns(db),
    listWarehousesWithCounts(db),
  ]);

  return (
    <LocationsView
      // Dates aren't needed on the page; keep the props plain.
      types={types.map(({ createdAt, ...rest }) => rest)}
      locations={locations}
      columns={columns.map(({ id, name, nameId, nameZh, warehouseId }) => ({ id, name, nameId, nameZh, warehouseId }))}
      warehouses={warehouses.map(({ sortOrder, ...rest }) => rest)}
    />
  );
}
