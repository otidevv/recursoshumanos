import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import {
  CARGOS_BY_CODE,
  DEPENDENCIAS_BY_CODE,
} from "@/lib/sunedu/catalogs";
import { DirectorioClient, type DirRow } from "./DirectorioClient";

export const metadata = { title: "Reporte: Directorio administrativo · UNAMAD" };
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

  const rows: DirRow[] = staff.map((s) => ({
    id: s.id,
    oficina:
      DEPENDENCIAS_BY_CODE.get(s.dependenciaCode) ??
      `Dep. ${s.dependenciaCode}`,
    dependenciaCode: s.dependenciaCode,
    nombre: nombreCompleto(s),
    dni: s.numeroDocumento,
    cargo: CARGOS_BY_CODE.get(s.cargoCode) ?? `Cargo ${s.cargoCode}`,
    correoInstitucional: s.correoInstitucional ?? "",
    correoPersonal: s.correoPersonal ?? "",
    celular: s.celular ?? "",
    status: s.status,
  }));

  return <DirectorioClient rows={rows} />;
}
