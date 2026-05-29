import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import {
  CARGOS_BY_CODE,
  DEPENDENCIAS_BY_CODE,
} from "@/lib/sunedu/catalogs";
import { AntiguedadClient, type AntRow } from "./AntiguedadClient";

export const metadata = { title: "Reporte: Antigüedad del personal · UNAMAD" };
export const dynamic = "force-dynamic";

const MS_DAY = 24 * 60 * 60 * 1000;

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
    include: {
      vinculos: {
        orderBy: { fechaInicio: "desc" },
        take: 1,
        select: { condicionContrato: true },
      },
    },
    orderBy: [{ fechaIngresoIE: "asc" }],
  });

  const today = new Date();
  const rows: AntRow[] = staff
    .filter((s) => s.fechaIngresoIE.getUTCFullYear() >= 1940)
    .map((s) => {
      const diff = today.getTime() - s.fechaIngresoIE.getTime();
      const totalMeses = Math.floor(diff / (MS_DAY * 30.44));
      const anios = Math.floor(totalMeses / 12);
      const mesesExtra = totalMeses % 12;
      return {
        id: s.id,
        nombre: nombreCompleto(s),
        dni: s.numeroDocumento,
        oficina:
          DEPENDENCIAS_BY_CODE.get(s.dependenciaCode) ??
          `Dep. ${s.dependenciaCode}`,
        cargo: CARGOS_BY_CODE.get(s.cargoCode) ?? `Cargo ${s.cargoCode}`,
        condicionVigente: s.vinculos[0]?.condicionContrato ?? null,
        fechaIngresoIE: s.fechaIngresoIE.toISOString(),
        anios,
        mesesExtra,
      };
    })
    .sort((a, b) => b.anios - a.anios || b.mesesExtra - a.mesesExtra);

  return <AntiguedadClient rows={rows} />;
}
