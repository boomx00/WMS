import { getDashboardData } from "@/lib/dashboard";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

// Home page: what came in and went out during the current office day
// (Settings → General → Office Hour, default 07:00 → 07:00). The heat map
// that used to live here is now at /heatmap.
export default async function DashboardPage() {
  const initial = await getDashboardData();
  return <DashboardClient initial={initial} />;
}
