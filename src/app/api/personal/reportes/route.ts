// GET /api/personal/reportes
//
// Genera el REPORTE INTERNO UNAMAD de personal CAS Determinado en xlsx.
// No confundir con /api/personal/export que genera el formato SUNEDU SIU.
//
// Query params:
//   year=2026                → vínculos del año (default: año del contrato vigente)
//   ids=cuid1,cuid2          → seleccionar trabajadores específicos
//   includeNoVigente=1       → incluye PASIVO/FALLECIMIENTO (default: solo ACTIVO+LICENCIA)
//
// Por diseño, este reporte aplica SOLO a personal CAS (DETERMINADO). Para otros
// regímenes se generan reportes separados (futuro).

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/server";
import { Prisma } from "@/generated/prisma/client";
import { DEPENDENCIAS_BY_CODE } from "@/lib/sunedu/catalogs";
import {
  generateCasReportXlsx,
  type CasReportRow,
} from "@/lib/reportes/cas-report";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await requirePermission("staff.export");

  const url = new URL(req.url);
  const yearRaw = url.searchParams.get("year");
  const idsRaw = url.searchParams.get("ids");
  const includeNoVigente = url.searchParams.get("includeNoVigente") === "1";

  const yearNum = yearRaw ? Number(yearRaw) : null;
  const validYear =
    yearNum != null && Number.isFinite(yearNum) && yearNum >= 2000
      ? yearNum
      : null;
  const ids = idsRaw
    ? idsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const statusFilter: Prisma.AdministrativeStaffWhereInput["status"] =
    includeNoVigente
      ? undefined
      : { in: ["ACTIVO", "LICENCIA"] };

  const where: Prisma.AdministrativeStaffWhereInput = {
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  if (ids.length > 0) {
    where.id = { in: ids };
  } else {
    // Solo CAS Determinado, opcionalmente filtrado por año.
    where.vinculos = {
      some: {
        condicionContrato: "DETERMINADO",
        ...(validYear != null ? { year: validYear } : {}),
      },
    };
  }

  const staff = await prisma.administrativeStaff.findMany({
    where,
    include: {
      vinculos: {
        orderBy: { fechaInicio: "desc" },
        where: { esAdenda: false },
      },
    },
    orderBy: [{ primerApellido: "asc" }, { nombres: "asc" }],
  });

  const reportRows: CasReportRow[] = staff.map((s) => {
    // Vínculo CAS vigente: el main DETERMINADO más reciente. Si filtramos por
    // año, preferimos uno de ese año; sino, el más reciente.
    const determinadoMains = s.vinculos.filter(
      (v) => v.condicionContrato === "DETERMINADO" && !v.esAdenda,
    );
    const preferred =
      validYear != null
        ? determinadoMains.find((v) => v.year === validYear) ??
          determinadoMains[0] ??
          null
        : determinadoMains[0] ?? null;

    // Nombre completo estilo DNI: "APELLIDOS NOMBRES" (sin coma para el reporte,
    // que es para uso interno — usuarios prefieren leer fluido).
    const apellidos = [s.primerApellido, s.segundoApellido]
      .filter(Boolean)
      .join(" ")
      .trim();
    const nombreCompleto = `${apellidos} ${s.nombres}`.trim();

    return {
      gradoMaximo: s.gradoMaximo,
      nombreCompleto,
      dni: s.numeroDocumento,
      celular: s.celular,
      escuelaProfesional: s.carreraEgresado,
      oficina:
        DEPENDENCIAS_BY_CODE.get(s.dependenciaCode) ??
        `Dependencia ${s.dependenciaCode}`,
      status: s.status as CasReportRow["status"],
      fechaVinculo: preferred?.fechaInicio ?? null,
    };
  });

  const xlsx = await generateCasReportXlsx(reportRows);

  // Nombre del archivo refleja filtros
  const today = new Date();
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const fechaStr = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;
  const parts = ["REPORTE_CAS"];
  if (ids.length > 0) parts.push(`SELECCION_${ids.length}`);
  if (validYear != null) parts.push(String(validYear));
  parts.push(fechaStr);
  const filename = `${parts.join("_")}.xlsx`;

  const body = new Uint8Array(xlsx.buffer, xlsx.byteOffset, xlsx.byteLength);
  return new NextResponse(body as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Report-Count": String(reportRows.length),
      "Cache-Control": "no-store",
    },
  });
}
