// GET /api/personal/reportes/{tipo}
//
// Endpoint para reportes adicionales del módulo /personal/reportes:
//   cumpleanos?mes=N  → Cumpleaños del mes (default mes actual)
//   directorio        → Directorio administrativo
//   antiguedad        → Antigüedad del personal
//
// Solo personal vigente (ACTIVO + LICENCIA) por defecto.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/server";
import { DEPENDENCIAS_BY_CODE, CARGOS_BY_CODE } from "@/lib/sunedu/catalogs";
import {
  generateCumpleanosXlsx,
  generateDirectorioXlsx,
  generateAntiguedadXlsx,
  type CumpleRow,
  type DirectorioRow,
  type AntiguedadRow,
} from "@/lib/reportes/extra-reports";
import {
  generateListadoOficialXlsx,
  generateResolucionesXlsx,
  type ListadoRow,
  type ResolucionRow,
} from "@/lib/reportes/listado-resoluciones";

export const dynamic = "force-dynamic";

const MS_DAY = 24 * 60 * 60 * 1000;

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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ tipo: string }> },
) {
  await requirePermission("staff.export");
  const { tipo } = await ctx.params;
  const url = new URL(req.url);

  const baseWhere = {
    status: { in: ["ACTIVO" as const, "LICENCIA" as const] },
  };
  const today = new Date();
  const todayStr = `${today.getFullYear()}${pad2(today.getMonth() + 1)}${pad2(today.getDate())}`;

  // ── CUMPLEAÑOS ───────────────────────────────────────────────
  if (tipo === "cumpleanos") {
    const mesParam = Number(url.searchParams.get("mes") ?? today.getUTCMonth() + 1);
    const mes = Number.isFinite(mesParam) && mesParam >= 1 && mesParam <= 12 ? mesParam : today.getUTCMonth() + 1;

    const staff = await prisma.administrativeStaff.findMany({
      where: {
        ...baseWhere,
        fechaNacimiento: { gte: new Date(Date.UTC(1940, 0, 1)) },
      },
      orderBy: [{ fechaNacimiento: "asc" }],
    });

    const rows: CumpleRow[] = staff
      .filter((s) => s.fechaNacimiento.getUTCMonth() + 1 === mes)
      .map((s) => ({
        nombre: nombreCompleto(s),
        dni: s.numeroDocumento,
        oficina: DEPENDENCIAS_BY_CODE.get(s.dependenciaCode) ?? `Dep. ${s.dependenciaCode}`,
        cargo: CARGOS_BY_CODE.get(s.cargoCode) ?? `Cargo ${s.cargoCode}`,
        fechaNacimiento: s.fechaNacimiento,
        diaCumple: `${pad2(s.fechaNacimiento.getUTCDate())}/${pad2(mes)}`,
        edadACumplir: today.getUTCFullYear() - s.fechaNacimiento.getUTCFullYear(),
      }))
      .sort((a, b) => {
        // Ordena por día del mes
        const da = Number(a.diaCumple.split("/")[0]);
        const db = Number(b.diaCumple.split("/")[0]);
        return da - db;
      });

    const xlsx = await generateCumpleanosXlsx(rows, mes);
    const filename = `REPORTE_CUMPLEANOS_${pad2(mes)}_${todayStr}.xlsx`;
    return respondXlsx(xlsx, filename, rows.length);
  }

  // ── DIRECTORIO ───────────────────────────────────────────────
  if (tipo === "directorio") {
    const staff = await prisma.administrativeStaff.findMany({
      where: baseWhere,
      orderBy: [{ dependenciaCode: "asc" }, { primerApellido: "asc" }, { nombres: "asc" }],
    });

    const rows: DirectorioRow[] = staff.map((s) => ({
      oficina: DEPENDENCIAS_BY_CODE.get(s.dependenciaCode) ?? `Dep. ${s.dependenciaCode}`,
      nombre: nombreCompleto(s),
      dni: s.numeroDocumento,
      cargo: CARGOS_BY_CODE.get(s.cargoCode) ?? `Cargo ${s.cargoCode}`,
      correoInstitucional: s.correoInstitucional ?? "",
      correoPersonal: s.correoPersonal ?? "",
      celular: s.celular ?? "",
    }));

    const xlsx = await generateDirectorioXlsx(rows);
    const filename = `DIRECTORIO_UNAMAD_${todayStr}.xlsx`;
    return respondXlsx(xlsx, filename, rows.length);
  }

  // ── ANTIGÜEDAD ───────────────────────────────────────────────
  if (tipo === "antiguedad") {
    const staff = await prisma.administrativeStaff.findMany({
      where: baseWhere,
      include: {
        vinculos: {
          orderBy: { fechaInicio: "desc" },
          take: 1,
          select: { condicionContrato: true },
        },
      },
      orderBy: [{ fechaIngresoIE: "asc" }],
    });

    const rows: AntiguedadRow[] = staff
      // Excluye fechas placeholder (año < 1940)
      .filter((s) => s.fechaIngresoIE.getUTCFullYear() >= 1940)
      .map((s) => {
        const diff = today.getTime() - s.fechaIngresoIE.getTime();
        const totalMeses = Math.floor(diff / (MS_DAY * 30.44));
        const anios = Math.floor(totalMeses / 12);
        const mesesExtra = totalMeses % 12;
        return {
          nombre: nombreCompleto(s),
          dni: s.numeroDocumento,
          oficina: DEPENDENCIAS_BY_CODE.get(s.dependenciaCode) ?? `Dep. ${s.dependenciaCode}`,
          cargo: CARGOS_BY_CODE.get(s.cargoCode) ?? `Cargo ${s.cargoCode}`,
          fechaIngresoIE: s.fechaIngresoIE,
          condicionVigente: s.vinculos[0]?.condicionContrato ?? "—",
          aniosAntiguedad: anios,
          mesesExtra,
        };
      })
      .sort((a, b) => b.aniosAntiguedad - a.aniosAntiguedad || b.mesesExtra - a.mesesExtra);

    const xlsx = await generateAntiguedadXlsx(rows);
    const filename = `ANTIGUEDAD_PERSONAL_${todayStr}.xlsx`;
    return respondXlsx(xlsx, filename, rows.length);
  }

  // ── LISTADO OFICIAL ──────────────────────────────────────────
  if (tipo === "listado-oficial") {
    const groupByUnidad = url.searchParams.get("group") === "unidad";
    const staff = await prisma.administrativeStaff.findMany({
      where: baseWhere,
      orderBy: [
        { dependenciaCode: "asc" },
        { primerApellido: "asc" },
        { nombres: "asc" },
      ],
    });
    const rows: ListadoRow[] = staff.map((s) => ({
      nombre: nombreCompleto(s),
      dni: s.numeroDocumento,
      cargo: CARGOS_BY_CODE.get(s.cargoCode) ?? `Cargo ${s.cargoCode}`,
      unidad:
        DEPENDENCIAS_BY_CODE.get(s.dependenciaCode) ??
        `Dep. ${s.dependenciaCode}`,
    }));
    const xlsx = await generateListadoOficialXlsx(rows, groupByUnidad);
    const filename = groupByUnidad
      ? `LISTADO_POR_UNIDAD_${todayStr}.xlsx`
      : `LISTADO_OFICIAL_${todayStr}.xlsx`;
    return respondXlsx(xlsx, filename, rows.length);
  }

  // ── RESOLUCIONES DE DESIGNACIÓN ─────────────────────────────
  if (tipo === "resoluciones") {
    const yearParam = url.searchParams.get("year");
    const yearNum = yearParam ? Number(yearParam) : null;
    const validYear =
      yearNum != null && Number.isFinite(yearNum) && yearNum >= 2000
        ? yearNum
        : null;
    const includeFinalizadas = url.searchParams.get("incluirFinalizadas") === "1";

    const where: Record<string, unknown> = {};
    if (validYear != null) {
      where.fechaInicio = {
        gte: new Date(Date.UTC(validYear, 0, 1)),
        lt: new Date(Date.UTC(validYear + 1, 0, 1)),
      };
    } else if (!includeFinalizadas) {
      // Solo vigentes: fechaCese null o futura
      where.OR = [
        { fechaCese: null },
        { fechaCese: { gte: new Date() } },
      ];
    }
    const designations = await prisma.staffDesignation.findMany({
      where,
      orderBy: [{ dependencia: "asc" }, { fechaInicio: "desc" }],
    });
    const rows: ResolucionRow[] = designations.map((d) => ({
      nombre: d.nombreCompleto,
      dni: d.dni,
      cargo: d.cargoDesempenado,
      dependencia: d.dependencia,
      documentoDesignacion: d.documentoDesignacion ?? "",
      correo: d.correo ?? "",
      fechaInicio: d.fechaInicio,
      fechaCese: d.fechaCese,
      notaFinCargo: d.notaFinCargo,
    }));
    const xlsx = await generateResolucionesXlsx(rows);
    const parts = ["RESOLUCIONES"];
    if (validYear != null) parts.push(String(validYear));
    parts.push(todayStr);
    const filename = `${parts.join("_")}.xlsx`;
    return respondXlsx(xlsx, filename, rows.length);
  }

  return NextResponse.json(
    { error: `Tipo de reporte desconocido: ${tipo}` },
    { status: 400 },
  );
}

function respondXlsx(buf: Buffer, filename: string, count: number) {
  const body = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  return new NextResponse(body as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Report-Count": String(count),
      "Cache-Control": "no-store",
    },
  });
}
