import { requirePermission } from "@/lib/auth/server";
import { StaffClient } from "../StaffClient";
import { loadStaffData } from "../loader";
import type { PermFlags } from "../types";

export const metadata = { title: "Personal CAS Indeterminado · UNAMAD Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requirePermission("staff.read");
  const { rows, locales } = await loadStaffData({
    condiciones: ["INDETERMINADO"],
  });

  const perms: PermFlags = {
    canRead: me.permissions.has("staff.read"),
    canWrite: me.permissions.has("staff.write"),
    canExport: me.permissions.has("staff.export"),
  };

  return (
    <StaffClient
      rows={rows}
      localOptions={locales}
      perms={perms}
      variant="indeterminado"
    />
  );
}
