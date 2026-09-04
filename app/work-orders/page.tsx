import { db } from "@/lib/db";
import { pallets } from "@/db/schema";
import { sql, desc } from "drizzle-orm";
import { getWorkOrderSummary } from "@/lib/workOrders";
import WorkOrdersTable from "./WorkOrdersTable";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

async function getDistinctWorkOrderCount() {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${pallets.workOrderNumber})::int` })
    .from(pallets);
  return row.count;
}

async function getWorkOrderNumbersForPage(page: number) {
  const offset = (page - 1) * PAGE_SIZE;
  const rows = await db
    .selectDistinct({ workOrderNumber: pallets.workOrderNumber })
    .from(pallets)
    .orderBy(desc(pallets.workOrderNumber))
    .limit(PAGE_SIZE)
    .offset(offset);
  return rows.map((r) => r.workOrderNumber);
}

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [totalCount, workOrderNumbers] = await Promise.all([
    getDistinctWorkOrderCount(),
    getWorkOrderNumbersForPage(page),
  ]);

  const workOrders = await getWorkOrderSummary(workOrderNumbers);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
 <div className="p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Work Orders</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Current tracked quantity vs. original inbound per work order.
        </p>
      </header>

      <WorkOrdersTable
        workOrders={workOrders}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
      />
    </div>
  );
}