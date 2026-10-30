import { db } from "@/lib/db";
import { listSalesOrderTypesWithCounts } from "@/lib/salesOrderTypes";
import SalesOrderTypesClient from "./SalesOrderTypesClient";

export const dynamic = "force-dynamic";

// Sales Orders → Sales Order Types: the document types (SO, HPT, ...) a
// sales order can be. Chosen on the create / edit sales order forms and
// used as checkboxes in Analytics → Sales Orders Shipped.
export default async function SalesOrderTypesPage() {
  const types = await listSalesOrderTypesWithCounts(db);

  return (
    <div className="p-8 max-w-3xl">
      <SalesOrderTypesClient initialTypes={types} />
    </div>
  );
}
