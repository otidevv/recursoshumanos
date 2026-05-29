import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import {
  CARGOS_BY_CODE,
  DEPENDENCIAS_BY_CODE,
} from "@/lib/sunedu/catalogs";
import { ListadoClient, type LisRow } from "./ListadoClient";

export const metadata = { title: "Reporte: Listado oficial por unidad · UNAMAD" };
export const dynamic = "force-dynamic";

function nombreCompleto(s: {
  primerApellido: string;
  segundoApellido: string | null;
  nombres: string;
}): string {
  const apellidos = [s.primerApellido, s.segundoApellido]
    .filter(Boolean)
    .join(" ")
    .trim();
  return `${apellidos}, ${s.nombres}`.trim();
}

export default async function Page() {
  await requirePermission("staff.read");
  const staff = await prisma.administrativeStaff.findMany({
    where: { status: { in: ["ACTIVO", "LICENCIA"] } },
    orderBy: [
      { dependenciaCode: "asc" },
      { primerApellido: "asc" },
      { nombres: "asc" },
    ],
  });
  const rows: LisRow[] = staff.map((s) => ({
    id: s.id,
    nombre: nombreCompleto(s),
    dni: s.numeroDocumento,
    cargo: CARGOS_BY_CODE.get(s.cargoCode) ?? `Cargo ${s.cargoCode}`,
    unidad:
      DEPENDENCIAS_BY_CODE.get(s.dependenciaCode) ?? `Dep. ${s.dependenciaCode}`,
  }));
  return <ListadoClient rows={rows} />;
}
