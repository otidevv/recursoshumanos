import { requirePermission } from "@/lib/auth/server";
import { loadDesignations } from "./loader";
import { DesignationsClient } from "./DesignationsClient";
import type { PermFlags } from "../types";

export const metadata = {
  title: "Designaciones de Confianza · UNAMAD Admin",
};
export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requirePermission("staff.read");
  const rows = await loadDesignations();
  const perms: PermFlags = {
    canRead: me.permissions.has("staff.read"),
    canWrite: me.permissions.has("staff.write"),
    canExport: me.permissions.has("staff.export"),
  };
  return <DesignationsClient rows={rows} perms={perms} />;
}
