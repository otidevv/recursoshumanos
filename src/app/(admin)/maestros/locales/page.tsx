import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/server";
import { ubigeoLabel } from "@/lib/sunedu";
import { LocalesClient } from "./LocalesClient";
import type { LocalRow, PermFlags } from "./types";

export const metadata = { title: "Sedes UNAMAD · Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await requirePermission("locales.read");

  const locales = await prisma.universityLocal.findMany({
    orderBy: [{ active: "desc" }, { code: "asc" }],
  });

  const rows: LocalRow[] = locales.map((l) => ({
    id: l.id,
    code: l.code,
    name: l.name,
    sedeFilial: l.sedeFilial,
    ubigeoCode: l.ubigeoCode,
    ubigeoLabel: ubigeoLabel(l.ubigeoCode) ?? l.ubigeoCode,
    direccion: l.direccion,
    tipoAutorizacion: l.tipoAutorizacion,
    active: l.active,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }));

  const perms: PermFlags = {
    canRead: me.permissions.has("locales.read"),
    canWrite: me.permissions.has("locales.write"),
  };

  return <LocalesClient rows={rows} perms={perms} />;
}
