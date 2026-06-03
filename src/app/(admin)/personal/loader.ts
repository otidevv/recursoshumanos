// Shared server-side loader for the AdministrativeStaff list across the
// surfaces: /personal (all), /personal/cas (DETERMINADO),
// /personal/indeterminado (INDETERMINADO), /personal/confianza (CONFIANZA).

import "server-only";
import { prisma } from "@/lib/prisma";
import {
  CARGOS_BY_CODE,
  DEPENDENCIAS_BY_CODE,
  REGIMENES_LABORAL_BY_CODE,
  TIPOS_DOCUMENTO_BY_CODE,
} from "@/lib/sunedu/catalogs";
import type {
  AdendaSummary,
  LocalOption,
  StaffCeseMotivo,
  StaffCondition,
  StaffRow,
  StaffStatus,
} from "./types";

export type LoadStaffFilter = {
  /** Si se da, filtra por la condición del vínculo más reciente del trabajador. */
  condiciones?: StaffCondition[];
};

export async function loadStaffData(
  filter: LoadStaffFilter = {},
): Promise<{ rows: StaffRow[]; locales: LocalOption[] }> {
  const [staff, locales] = await Promise.all([
    prisma.administrativeStaff.findMany({
      include: {
        _count: { select: { vinculos: true, workplaces: true } },
        vinculos: {
          orderBy: { fechaInicio: "desc" },
          select: {
            id: true,
            condicionContrato: true,
            regimenLaboralCode: true,
            fechaInicio: true,
            fechaTermino: true,
            esAdenda: true,
            year: true,
          },
        },
      },
      // Postgres ordena enums por orden de declaración: ACTIVO=0, PASIVO=1,
      // LICENCIA=2, FALLECIMIENTO=3 — entonces ASC lista a ACTIVO primero.
      orderBy: [{ status: "asc" }, { primerApellido: "asc" }],
    }),
    prisma.universityLocal.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  let rows: StaffRow[] = staff.map((s) => {
    // Prisma trae vinculos en orden DESC; re-ordenamos ASC.
    const byFecha = [...s.vinculos].sort(
      (a, b) => a.fechaInicio.getTime() - b.fechaInicio.getTime(),
    );
    const yearOf = (v: { year: number | null; fechaInicio: Date }) =>
      v.year ?? v.fechaInicio.getFullYear();

    // Contrato VIGENTE = el main (esAdenda=false) con fechaInicio más reciente.
    // Un trabajador con contratos 2024 + 2025 + 2026 → vigente = 2026.
    const allMains = byFecha.filter((v) => !v.esAdenda);
    const currentMain = allMains[allMains.length - 1] ?? null;
    const currentYear = currentMain ? yearOf(currentMain) : null;

    // Adendas SOLO del año del contrato vigente.
    const currentYearAdendas =
      currentYear != null
        ? byFecha.filter((v) => v.esAdenda && yearOf(v) === currentYear)
        : [];
    const latestAdenda =
      currentYearAdendas[currentYearAdendas.length - 1] ?? null;

    // El "latest" para condicion/regimen: el más reciente cronológico.
    const latest = byFecha[byFecha.length - 1] ?? null;
    const regimenCode = latest?.regimenLaboralCode ?? null;

    // Timeline COMPLETO para el modal (todos los años + sus adendas).
    const adendaSummaries: AdendaSummary[] = byFecha.map((v) => ({
      id: v.id,
      fechaInicio: v.fechaInicio.toISOString(),
      fechaTermino: v.fechaTermino?.toISOString() ?? null,
      esAdenda: v.esAdenda,
    }));

    // Años en los que existe al menos un vínculo (orden ascendente).
    const availableYears = [
      ...new Set(byFecha.map((v) => yearOf(v))),
    ].sort((a, b) => a - b);

    return {
      id: s.id,
      cargoCode: s.cargoCode,
      cargoLabel: CARGOS_BY_CODE.get(s.cargoCode) ?? `Cargo ${s.cargoCode}`,
      dependenciaCode: s.dependenciaCode,
      dependenciaLabel:
        DEPENDENCIAS_BY_CODE.get(s.dependenciaCode) ??
        `Dep. ${s.dependenciaCode}`,
      tipoDocumentoCode: s.tipoDocumentoCode,
      tipoDocumentoLabel:
        TIPOS_DOCUMENTO_BY_CODE.get(s.tipoDocumentoCode) ??
        `Doc ${s.tipoDocumentoCode}`,
      numeroDocumento: s.numeroDocumento,
      nombres: s.nombres,
      primerApellido: s.primerApellido,
      segundoApellido: s.segundoApellido,
      apellidoCasada: s.apellidoCasada,
      unSoloApellido: s.unSoloApellido,
      condicionDiscapacidad: s.condicionDiscapacidad,
      tipoDiscapacidadCode: s.tipoDiscapacidadCode,
      // Formato Excel-style: "APELLIDO APELLIDO, NOMBRES" (con coma separadora,
      // como aparece en los listados originales de UNAMAD).
      fullName: (() => {
        const apellidos = [s.primerApellido, s.segundoApellido]
          .filter(Boolean)
          .join(" ")
          .trim();
        const nombres = s.nombres.trim();
        return apellidos && nombres
          ? `${apellidos}, ${nombres}`
          : apellidos || nombres;
      })(),
      sexoCode: s.sexoCode,
      fechaIngresoIE: s.fechaIngresoIE.toISOString(),
      fechaNacimiento: s.fechaNacimiento.toISOString(),
      paisNacimientoCode: s.paisNacimientoCode,
      ubigeoNacimiento: s.ubigeoNacimiento,
      ubigeoDomicilio: s.ubigeoDomicilio,
      correoInstitucional: s.correoInstitucional,
      correoPersonal: s.correoPersonal,
      telefono: s.telefono,
      celular: s.celular,

      gradoMaximo: s.gradoMaximo,
      grupoCarrera: s.grupoCarrera,
      carreraEgresado: s.carreraEgresado,
      puestoDetallado: s.puestoDetallado,
      plazaOrigen: s.plazaOrigen,
      plazaActual: s.plazaActual,

      currentCondicion:
        latest?.condicionContrato &&
        ["DETERMINADO", "INDETERMINADO", "CONFIANZA"].includes(
          latest.condicionContrato,
        )
          ? (latest.condicionContrato as StaffCondition)
          : null,
      currentRegimenLaboralCode: regimenCode,
      currentRegimenLaboralLabel:
        regimenCode != null
          ? (REGIMENES_LABORAL_BY_CODE.get(regimenCode) ??
            `Régimen ${regimenCode}`)
          : null,

      contractInicio: currentMain?.fechaInicio.toISOString() ?? null,
      contractTermino: currentMain?.fechaTermino?.toISOString() ?? null,
      currentYear,
      latestAdendaInicio: latestAdenda?.fechaInicio.toISOString() ?? null,
      latestAdendaTermino: latestAdenda?.fechaTermino?.toISOString() ?? null,
      // Conteo de adendas del AÑO VIGENTE (no de todos los años).
      adendasCount: currentYearAdendas.length,
      adendas: adendaSummaries,
      availableYears,

      status: s.status as StaffStatus,
      fechaCese: s.fechaCese?.toISOString() ?? null,
      motivoCese: (s.motivoCese as StaffCeseMotivo | null) ?? null,
      documentoCese: s.documentoCese,
      vinculosCount: s._count.vinculos,
      workplacesCount: s._count.workplaces,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  });

  if (filter.condiciones && filter.condiciones.length > 0) {
    const set = new Set(filter.condiciones);
    rows = rows.filter(
      (r) => r.currentCondicion && set.has(r.currentCondicion),
    );
  }

  return { rows, locales };
}
