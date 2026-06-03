// GET /api/personal/export
//
// Returns the SUNEDU SIU "Carga Masiva General" xlsx con los trabajadores
// que pasan los filtros del query string. Sin filtros → exporta TODO el
// personal vigente (ACTIVO + LICENCIA).
//
// Query params (todos opcionales):
//   variant=cas              → solo workers cuyo vínculo es DETERMINADO
//   variant=indeterminado    → solo workers cuyo vínculo es INDETERMINADO
//   variant=confianza        → solo workers cuyo vínculo es CONFIANZA
//   variant=indeterminados   → (compat) INDETERMINADO o CONFIANZA (vista antigua)
//   year=2026                → solo workers con al menos un vínculo en ese año
//   cargo=3,9                → solo esos cargoCode (facetas de la UI)
//   dep=9,4                  → solo esos dependenciaCode (facetas de la UI)
//   estado=ACTIVO,LICENCIA   → estrecha el estado DENTRO de lo exportable
//   condicion=INDETERMINADO  → refina la condición del vínculo (vista Indet.)
//   regimen=4,7              → solo esos regimenLaboralCode (facetas de la UI)
//   ids=cuid1,cuid2,cuid3    → solo esos workers específicos (override variant/year/facetas)
//
// Combinaciones: variant=cas&year=2026&cargo=3 → DETERMINADO + año 2026 + cargo 3.
// Nota: el export SIEMPRE se limita a ACTIVO/LICENCIA (regla SUNEDU); el facet
// `estado` solo puede estrechar dentro de ese conjunto, nunca ampliarlo.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/server";
import { Prisma } from "@/generated/prisma/client";
import {
  generateSuneduXlsx,
  type StaffExportRow,
} from "@/lib/sunedu/export";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await requirePermission("staff.export");

  const url = new URL(req.url);
  const variant = url.searchParams.get("variant");
  const yearRaw = url.searchParams.get("year");
  const idsRaw = url.searchParams.get("ids");

  const yearNum = yearRaw ? Number(yearRaw) : null;
  const validYear =
    yearNum != null && Number.isFinite(yearNum) && yearNum >= 2000
      ? yearNum
      : null;
  const ids = idsRaw
    ? idsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const parseCodes = (raw: string | null): number[] =>
    raw
      ? raw
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n))
      : [];
  const cargoCodes = parseCodes(url.searchParams.get("cargo"));
  const depCodes = parseCodes(url.searchParams.get("dep"));
  const regimenCodes = parseCodes(url.searchParams.get("regimen"));
  const estadosRaw = (url.searchParams.get("estado") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const condicionesRaw = (url.searchParams.get("condicion") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const VALID_CONDICIONES = [
    "DETERMINADO",
    "INDETERMINADO",
    "CONFIANZA",
  ] as const;
  const condicionFacet = VALID_CONDICIONES.filter((c) =>
    condicionesRaw.includes(c),
  );

  // Construye filtro Prisma.
  const where: Prisma.AdministrativeStaffWhereInput = {
    status: { in: ["ACTIVO", "LICENCIA"] },
  };

  if (ids.length > 0) {
    // Exportación de selección específica — ignora variant/year/facetas.
    where.id = { in: ids };
  } else {
    // Facetas staff-level (exactas): Cargo / Dependencia / Estado. El facet
    // Estado solo puede estrechar dentro del conjunto exportable (ACTIVO/
    // LICENCIA): si el usuario pidió solo PASIVO, la intersección es vacía → 0.
    if (cargoCodes.length > 0) {
      where.cargoCode = { in: cargoCodes };
    }
    if (depCodes.length > 0) {
      where.dependenciaCode = { in: depCodes };
    }
    if (estadosRaw.length > 0) {
      const exportable = ["ACTIVO", "LICENCIA"] as const;
      const allowed = exportable.filter((e) => estadosRaw.includes(e));
      where.status = { in: [...allowed] };
    }

    // Prefiltro coarse por variant (condición del contrato) + año, vía `some`.
    // Las facetas Condición/Régimen NO van aquí: el cliente las filtra por el
    // vínculo MÁS RECIENTE (currentCondicion/currentRegimenLaboralCode), no por
    // "cualquier vínculo histórico". Para no divergir de la tabla, las afinamos
    // en memoria tras la query (ver más abajo). Este `some` solo limita las
    // filas cargadas y es un superconjunto del resultado final.
    const vinculosFilter: Prisma.StaffEmploymentLinkWhereInput = {};
    if (variant === "cas") {
      vinculosFilter.condicionContrato = "DETERMINADO";
    } else if (variant === "indeterminado") {
      vinculosFilter.condicionContrato = "INDETERMINADO";
    } else if (variant === "confianza") {
      vinculosFilter.condicionContrato = "CONFIANZA";
    } else if (variant === "indeterminados") {
      // Compat: enlace antiguo de la vista combinada (ahora separada).
      vinculosFilter.condicionContrato = {
        in: ["INDETERMINADO", "CONFIANZA"],
      };
    }
    if (validYear != null) {
      vinculosFilter.year = validYear;
    }
    if (Object.keys(vinculosFilter).length > 0) {
      where.vinculos = { some: vinculosFilter };
    }
  }

  const staff = await prisma.administrativeStaff.findMany({
    where,
    include: {
      vinculos: { orderBy: { fechaInicio: "asc" } },
      workplaces: {
        include: { local: { select: { code: true } } },
      },
    },
    orderBy: [{ primerApellido: "asc" }, { nombres: "asc" }],
  });

  // Afinado de facetas Condición/Régimen por el vínculo MÁS RECIENTE — idéntico
  // a la UI (loader.ts deriva currentCondicion/currentRegimenLaboralCode del
  // último vínculo por fechaInicio). `vinculos` viene ASC, así que el más
  // reciente es el último. En modo `ids` (selección explícita) no aplica.
  const applyFacets =
    ids.length === 0 && (condicionFacet.length > 0 || regimenCodes.length > 0);
  const facetFilteredStaff = applyFacets
    ? staff.filter((s) => {
        const latest = s.vinculos[s.vinculos.length - 1];
        if (!latest) return false;
        if (
          condicionFacet.length > 0 &&
          !condicionFacet.includes(
            latest.condicionContrato as (typeof VALID_CONDICIONES)[number],
          )
        ) {
          return false;
        }
        if (
          regimenCodes.length > 0 &&
          !regimenCodes.includes(latest.regimenLaboralCode)
        ) {
          return false;
        }
        return true;
      })
    : staff;

  const rows: StaffExportRow[] = facetFilteredStaff.map((s) => ({
    cargoCode: s.cargoCode,
    dependenciaCode: s.dependenciaCode,
    fechaIngresoIE: s.fechaIngresoIE,
    tipoDocumentoCode: s.tipoDocumentoCode,
    numeroDocumento: s.numeroDocumento,
    nombres: s.nombres,
    primerApellido: s.primerApellido,
    segundoApellido: s.segundoApellido,
    apellidoCasada: s.apellidoCasada,
    unSoloApellido: s.unSoloApellido,
    condicionDiscapacidad: s.condicionDiscapacidad,
    tipoDiscapacidadCode: s.tipoDiscapacidadCode,
    sexoCode: s.sexoCode,
    fechaNacimiento: s.fechaNacimiento,
    paisNacimientoCode: s.paisNacimientoCode,
    ubigeoNacimiento: s.ubigeoNacimiento,
    ubigeoDomicilio: s.ubigeoDomicilio,
    correoInstitucional: s.correoInstitucional,
    correoPersonal: s.correoPersonal,
    telefono: s.telefono,
    celular: s.celular,
    vinculos: s.vinculos.map((v) => ({
      regimenLaboralCode: v.regimenLaboralCode,
      vinculoActualCode: v.vinculoActualCode,
      fechaInicio: v.fechaInicio,
      fechaTermino: v.fechaTermino,
    })),
    workplaces: s.workplaces.map((w) => ({
      otroLocal: w.otroLocal,
      localCode: w.local?.code ?? null,
      ubigeoLocal: w.ubigeoLocal,
      direccion: w.direccion,
    })),
  }));

  const xlsx = await generateSuneduXlsx(rows);

  // Filename refleja el filtro aplicado
  const today = new Date();
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const fechaStr = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;
  const parts = ["SUNEDU_PERSONAL"];
  if (ids.length > 0) parts.push(`SELECCION_${ids.length}`);
  else {
    if (variant === "cas") parts.push("CAS");
    else if (variant === "indeterminado") parts.push("INDETERMINADO");
    else if (variant === "confianza") parts.push("CONFIANZA");
    else if (variant === "indeterminados") parts.push("INDET");
    else parts.push("TODOS");
    if (validYear != null) parts.push(String(validYear));
    if (
      cargoCodes.length ||
      depCodes.length ||
      estadosRaw.length ||
      regimenCodes.length ||
      condicionesRaw.length
    )
      parts.push("FILTRADO");
  }
  parts.push(fechaStr);
  const filename = `${parts.join("_")}.xlsx`;

  const body = new Uint8Array(
    xlsx.buffer,
    xlsx.byteOffset,
    xlsx.byteLength,
  );
  return new NextResponse(body as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Export-Count": String(rows.length),
      "Cache-Control": "no-store",
    },
  });
}
