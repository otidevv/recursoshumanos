import "server-only";
import { prisma } from "@/lib/prisma";

export type DashboardData = {
  // KPIs principales
  totalPersonal: number;
  porStatus: { ACTIVO: number; PASIVO: number; LICENCIA: number; FALLECIMIENTO: number };
  porCondicionVigente: { DETERMINADO: number; INDETERMINADO: number; CONFIANZA: number; ninguna: number };
  vigentes: number; // ACTIVO + LICENCIA
  // Designaciones
  designacionesVigentes: number;
  designacionesIndefinidas: number;
  // Issues de calidad de datos
  conCargoPlaceholder: number; // cargoCode === 1
  conDependenciaPlaceholder: number; // dependenciaCode === 9
  conFechaNacPlaceholder: number; // año < 1940
  sinCarrera: number;
  // Cumpleaños del mes (siguientes 31 días)
  cumpleanosMes: {
    id: string;
    nombre: string;
    dni: string;
    fechaNacimiento: string; // ISO
    diaDelAno: string; // "12/05"
    edad: number;
    cargoLabel: string;
  }[];
  // Contratos por vencer (próximos 60 días)
  contratosPorVencer: {
    staffId: string;
    nombre: string;
    dni: string;
    fechaTermino: string; // ISO
    diasRestantes: number;
  }[];
  // Designaciones por vencer
  designacionesPorVencer: {
    id: string;
    nombreCompleto: string;
    cargo: string;
    fechaCese: string;
    diasRestantes: number;
  }[];
};

const MS_DAY = 24 * 60 * 60 * 1000;

function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function loadDashboard(): Promise<DashboardData> {
  const now = new Date();
  const today = utcDateOnly(now);
  const in60 = new Date(today.getTime() + 60 * MS_DAY);

  // Cargos placeholder
  const [
    totalPersonal,
    porStatusRaw,
    designacionesAll,
    conCargoPlaceholder,
    conDependenciaPlaceholder,
    conFechaNacPlaceholder,
    sinCarrera,
    staffConFechaNacYCargo,
    vinculosPorVencer,
    designacionesPorVencerRaw,
  ] = await Promise.all([
    prisma.administrativeStaff.count(),
    prisma.administrativeStaff.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.staffDesignation.findMany({
      select: { fechaCese: true, notaFinCargo: true },
    }),
    prisma.administrativeStaff.count({ where: { cargoCode: 1 } }),
    prisma.administrativeStaff.count({ where: { dependenciaCode: 9 } }),
    prisma.administrativeStaff.count({
      where: { fechaNacimiento: { lt: new Date(Date.UTC(1940, 0, 1)) } },
    }),
    prisma.administrativeStaff.count({
      where: { OR: [{ carreraEgresado: null }, { carreraEgresado: "" }] },
    }),
    prisma.administrativeStaff.findMany({
      where: {
        status: { in: ["ACTIVO", "LICENCIA"] },
        fechaNacimiento: { gte: new Date(Date.UTC(1940, 0, 1)) },
      },
      select: {
        id: true,
        primerApellido: true,
        segundoApellido: true,
        nombres: true,
        numeroDocumento: true,
        fechaNacimiento: true,
        cargoCode: true,
      },
    }),
    prisma.staffEmploymentLink.findMany({
      where: {
        esAdenda: false,
        condicionContrato: "DETERMINADO",
        fechaTermino: {
          gte: today,
          lte: in60,
        },
        staff: { status: { in: ["ACTIVO", "LICENCIA"] } },
      },
      include: {
        staff: {
          select: {
            id: true,
            numeroDocumento: true,
            primerApellido: true,
            segundoApellido: true,
            nombres: true,
          },
        },
      },
      orderBy: { fechaTermino: "asc" },
    }),
    prisma.staffDesignation.findMany({
      where: {
        fechaCese: { gte: today, lte: in60 },
      },
      orderBy: { fechaCese: "asc" },
    }),
  ]);

  // Status
  const porStatus = { ACTIVO: 0, PASIVO: 0, LICENCIA: 0, FALLECIMIENTO: 0 };
  for (const s of porStatusRaw) {
    porStatus[s.status as keyof typeof porStatus] = s._count._all;
  }

  // Condición vigente: necesitamos el vínculo más reciente por trabajador.
  const lastLinks = await prisma.$queryRaw<
    { staffId: string; condicionContrato: string | null }[]
  >`
    SELECT DISTINCT ON ("staffId") "staffId", "condicionContrato"
    FROM "StaffEmploymentLink"
    ORDER BY "staffId", "fechaInicio" DESC
  `;
  const porCondicionVigente = {
    DETERMINADO: 0,
    INDETERMINADO: 0,
    CONFIANZA: 0,
    ninguna: totalPersonal,
  };
  for (const l of lastLinks) {
    if (l.condicionContrato && l.condicionContrato in porCondicionVigente) {
      porCondicionVigente[
        l.condicionContrato as "DETERMINADO" | "INDETERMINADO" | "CONFIANZA"
      ]++;
      porCondicionVigente.ninguna--;
    }
  }

  // Designaciones: contar VIGENTE (cese > hoy o null sin nota) e INDEFINIDA (cese null con nota)
  let designacionesVigentes = 0;
  let designacionesIndefinidas = 0;
  for (const d of designacionesAll) {
    if (d.fechaCese != null) {
      if (d.fechaCese.getTime() > today.getTime()) designacionesVigentes++;
    } else {
      if (d.notaFinCargo) designacionesIndefinidas++;
      else designacionesVigentes++;
    }
  }

  // Cumpleaños: incluir los que cumplen en los próximos 31 días.
  // Tomamos mes/día y comparamos contra hoy.
  const todayMonth = now.getUTCMonth(); // 0-11
  const todayDay = now.getUTCDate();
  const in31 = new Date(today.getTime() + 31 * MS_DAY);
  const in31Month = in31.getUTCMonth();
  const in31Day = in31.getUTCDate();

  function dayOfYear(month: number, day: number): number {
    return month * 31 + day;
  }
  const startKey = dayOfYear(todayMonth, todayDay);
  const endKey = dayOfYear(in31Month, in31Day);
  const crossYear = endKey < startKey;

  type CumpleRow = DashboardData["cumpleanosMes"][number] & { sortKey: number };
  const cumpleRows: CumpleRow[] = [];
  for (const s of staffConFechaNacYCargo) {
    const m = s.fechaNacimiento.getUTCMonth();
    const d = s.fechaNacimiento.getUTCDate();
    const k = dayOfYear(m, d);
    const include = crossYear
      ? k >= startKey || k <= endKey
      : k >= startKey && k <= endKey;
    if (!include) continue;
    const apellidos = [s.primerApellido, s.segundoApellido]
      .filter(Boolean)
      .join(" ")
      .trim();
    const nombre = `${apellidos}, ${s.nombres}`;
    // Edad que cumplirá
    const yearNow = now.getUTCFullYear();
    const birthYear = s.fechaNacimiento.getUTCFullYear();
    const edad = yearNow - birthYear;
    const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
    // sortKey: días desde hoy hasta el cumple. Si crossYear y k < startKey,
    // es el año siguiente.
    let sortKey = k - startKey;
    if (crossYear && k < startKey) sortKey = 366 - startKey + k;
    cumpleRows.push({
      id: s.id,
      nombre,
      dni: s.numeroDocumento,
      fechaNacimiento: s.fechaNacimiento.toISOString(),
      diaDelAno: `${pad2(d)}/${pad2(m + 1)}`,
      edad,
      cargoLabel: `Cargo ${s.cargoCode}`,
      sortKey,
    });
  }
  cumpleRows.sort((a, b) => a.sortKey - b.sortKey);
  const cumpleanosMes = cumpleRows.slice(0, 15).map(({ sortKey, ...rest }) => {
    void sortKey;
    return rest;
  });

  // Contratos por vencer
  const contratosPorVencer = vinculosPorVencer.map((v) => {
    const apellidos = [v.staff.primerApellido, v.staff.segundoApellido]
      .filter(Boolean)
      .join(" ")
      .trim();
    return {
      staffId: v.staff.id,
      nombre: `${apellidos}, ${v.staff.nombres}`,
      dni: v.staff.numeroDocumento,
      fechaTermino: v.fechaTermino!.toISOString(),
      diasRestantes: Math.floor(
        (v.fechaTermino!.getTime() - today.getTime()) / MS_DAY,
      ),
    };
  });

  // Designaciones por vencer
  const designacionesPorVencer = designacionesPorVencerRaw.map((d) => ({
    id: d.id,
    nombreCompleto: d.nombreCompleto,
    cargo: d.cargoDesempenado,
    fechaCese: d.fechaCese!.toISOString(),
    diasRestantes: Math.floor(
      (d.fechaCese!.getTime() - today.getTime()) / MS_DAY,
    ),
  }));

  const vigentes = porStatus.ACTIVO + porStatus.LICENCIA;

  return {
    totalPersonal,
    porStatus,
    porCondicionVigente,
    vigentes,
    designacionesVigentes,
    designacionesIndefinidas,
    conCargoPlaceholder,
    conDependenciaPlaceholder,
    conFechaNacPlaceholder,
    sinCarrera,
    cumpleanosMes,
    contratosPorVencer,
    designacionesPorVencer,
  };
}
