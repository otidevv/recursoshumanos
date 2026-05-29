import { requirePermission } from "@/lib/auth/server";
import { loadStaffData } from "../../loader";
import { ReportClient } from "./ReportClient";
import type { PermFlags } from "../../types";

export const metadata = { title: "Reporte CAS Determinado · UNAMAD Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requirePermission("staff.read");
  const { rows } = await loadStaffData({ condiciones: ["DETERMINADO"] });

  const perms: PermFlags = {
    canRead: me.permissions.has("staff.read"),
    canWrite: me.permissions.has("staff.write"),
    canExport: me.permissions.has("staff.export"),
  };

  return <ReportClient rows={rows} perms={perms} />;
}
