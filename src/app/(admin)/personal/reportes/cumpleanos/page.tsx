import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import {
  CARGOS_BY_CODE,
  DEPENDENCIAS_BY_CODE,
} from "@/lib/sunedu/catalogs";
import { CumpleanosClient, type CumpleRow } from "./CumpleanosClient";

export const metadata = { title: "Reporte: Cumpleaños del mes · UNAMAD" };
export const dynamic = "force-dynamic";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

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

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  await requirePermission("staff.read");
  const sp = await searchParams;
  const today = new Date();
  const mesParam = Number(sp.mes ?? today.getUTCMonth() + 1);
  const mes =
    Number.isFinite(mesParam) && mesParam >= 1 && mesParam <= 12
      ? mesParam
      : today.getUTCMonth() + 1;

  const staff = await prisma.administrativeStaff.findMany({
    where: {
      status: { in: ["ACTIVO", "LICENCIA"] },
      fechaNacimiento: { gte: new Date(Date.UTC(1940, 0, 1)) },
    },
    orderBy: [{ fechaNacimiento: "asc" }],
  });

  const rows: CumpleRow[] = staff
    .filter((s) => s.fechaNacimiento.getUTCMonth() + 1 === mes)
    .map((s) => ({
      id: s.id,
      nombre: nombreCompleto(s),
      dni: s.numeroDocumento,
      oficina:
        DEPENDENCIAS_BY_CODE.get(s.dependenciaCode) ??
        `Dep. ${s.dependenciaCode}`,
      cargo: CARGOS_BY_CODE.get(s.cargoCode) ?? `Cargo ${s.cargoCode}`,
      dia: pad2(s.fechaNacimiento.getUTCDate()),
      mes: pad2(mes),
      edadACumplir:
        today.getUTCFullYear() - s.fechaNacimiento.getUTCFullYear(),
    }))
    .sort((a, b) => Number(a.dia) - Number(b.dia));

  return <CumpleanosClient rows={rows} mes={mes} />;
}
