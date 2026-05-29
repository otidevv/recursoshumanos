import "server-only";
import { prisma } from "@/lib/prisma";
import {
  CARGOS_BY_CODE,
  DEPENDENCIAS_BY_CODE,
} from "@/lib/sunedu/catalogs";

export type IssueKind =
  | "cargo-placeholder"
  | "dependencia-placeholder"
  | "fecha-nac-placeholder"
  | "sin-carrera"
  | "nombres-swapped";

export type IssueRow = {
  id: string;
  dni: string;
  nombreCompleto: string;
  primerApellido: string;
  segundoApellido: string | null;
  nombres: string;
  cargoCode: number;
  cargoLabel: string;
  dependenciaCode: number;
  dependenciaLabel: string;
  fechaNacimiento: string; // ISO
  carreraEgresado: string | null;
  status: string;
  currentCondicion: string | null;
  kind: IssueKind;
};

export type QualityData = {
  totalStaff: number;
  cargoPlaceholder: IssueRow[];
  dependenciaPlaceholder: IssueRow[];
  fechaNacPlaceholder: IssueRow[];
  sinCarrera: IssueRow[];
  nombresSwapped: IssueRow[]; // heurística
};

// Heurística para detectar nombres swapped: nombres comunes en el campo
// primerApellido. Lista expandida con:
// - Nombres comunes peruanos M/F
// - Excluye palabras que SON apellidos legítimos en Perú (LUIS, JOSE,
//   ANTONIO, ALBERTO también son apellidos) — esto sube precisión.
//
// Estrategia mejorada: requerir que TANTO primerApellido como nombres
// sean detectables como inverso (primer apellido es nombre Y los "nombres"
// contienen un apellido típico). Esto reduce false positives en personas
// que sí tienen "MARIO MAMANI" como apellidos.
const NOMBRES_TIPICOS = new Set([
  // Hombres
  "HENRY",
  "JHON",
  "EDISON",
  "EDWIN",
  "EDGAR",
  "JHONATAN",
  "JOSUE",
  "ABEL",
  "ABEL",
  "ANDY",
  "WILDER",
  "WILMER",
  "WILSON",
  "RONALD",
  "DAVID",
  "DIEGO",
  "DERIAN",
  "DARWIN",
  "GERSON",
  "RUBEN",
  "RUDY",
  "FRANKLIN",
  "FREDDY",
  "FRED",
  "JIMMY",
  "JONATHAN",
  "KEVIN",
  "JOHN",
  "JOSEPH",
  "JESUS",
  "JAVIER",
  "JAIRO",
  "JOEL",
  "RAUL",
  "RICHARD",
  "BRYAN",
  "BRAYAN",
  "ANGEL",
  "MICHAEL",
  "NESTOR",
  "VICTOR",
  "JULIO",
  "MARCO",
  "ELVIS",
  "ELMER",
  "ELMO",
  "WALTER",
  "GUSTAVO",
  "EDUARDO",
  "ALEJANDRO",
  "HUGO",
  "ALEX",
  "ALEXIS",
  "ALEXANDER",
  "RICARDO",
  "RAMON",
  "ROBERTO",
  "FERNANDO",
  "MARIO",
  "MAURICIO",
  "FRANCISCO",
  "JORGE",
  // Mujeres
  "MARIA",
  "ROSA",
  "ANA",
  "LUCIA",
  "PATRICIA",
  "MARTHA",
  "MILAGROS",
  "GLORIA",
  "ELENA",
  "ESTHER",
  "MERCEDES",
  "NORMA",
  "GLADYS",
  "MICHELLE",
  "MAYJORI",
  "RUTH",
  "BETSABE",
  "BERSABET",
  "MABETH",
  "MILUSKA",
  "MAYUMI",
  "EVELYN",
  "EVELIN",
  "VANESSA",
  "VANESA",
  "CINTHIA",
  "CYNTHIA",
  "JESSICA",
  "JANETH",
  "PAOLA",
  "KARINA",
  "KARLA",
  "LIZ",
  "LIZBETH",
  "LIZZ",
  "LUZ",
  "AYDE",
  "AYDEE",
  "FLORA",
  "FLOR",
  "OLINDA",
  "JUANA",
  "JULIA",
  "JULIANA",
  "ELIZABETH",
  "SUSANA",
  "SUSI",
  "SUSY",
  "MILAGRO",
  "MABEL",
  "MARCIA",
  "MARILYN",
  "ROXANA",
  "ROXANNE",
  "BRENDA",
  "YESSENIA",
  "YESENIA",
]);

// Apellidos comunes peruanos (para validar que los "nombres" del campo
// nombres en realidad parezcan apellidos cuando el primerApellido es un nombre).
const APELLIDOS_TIPICOS = new Set([
  "MAMANI",
  "QUISPE",
  "HUAMAN",
  "HUAMANI",
  "FLORES",
  "RAMOS",
  "VARGAS",
  "ROJAS",
  "CASTRO",
  "MENDOZA",
  "TORRES",
  "GUTIERREZ",
  "DIAZ",
  "FERNANDEZ",
  "PEREZ",
  "LOPEZ",
  "GARCIA",
  "SANCHEZ",
  "RAMIREZ",
  "MARTINEZ",
  "RODRIGUEZ",
  "GONZALES",
  "GONZALEZ",
  "PAUCAR",
  "CHOQUE",
  "CONDORI",
  "APAZA",
  "TICONA",
  "MAYTA",
  "CCAMA",
  "LIMACHI",
  "CALSINA",
  "CAHUI",
  "JIMENEZ",
  "VILLALTA",
  "BARRA",
  "BOURONCLE",
  "QUILLE",
  "TINEO",
  "VILCHEZ",
  "MAMANI",
  "PINTO",
  "AMANQUI",
  "CHIPANA",
  "MACHACA",
  "PUMA",
  "VELASQUEZ",
  "SULLA",
  "QUEA",
  "CHARCA",
  "TITI",
]);

function mapStaffToIssue(
  s: {
    id: string;
    numeroDocumento: string;
    primerApellido: string;
    segundoApellido: string | null;
    nombres: string;
    cargoCode: number;
    dependenciaCode: number;
    fechaNacimiento: Date;
    carreraEgresado: string | null;
    status: string;
    vinculos: { condicionContrato: string | null }[];
  },
  kind: IssueKind,
): IssueRow {
  const apellidos = [s.primerApellido, s.segundoApellido]
    .filter(Boolean)
    .join(" ")
    .trim();
  const lastLink = s.vinculos[0] ?? null;
  return {
    id: s.id,
    dni: s.numeroDocumento,
    nombreCompleto: `${apellidos}, ${s.nombres}`.trim(),
    primerApellido: s.primerApellido,
    segundoApellido: s.segundoApellido,
    nombres: s.nombres,
    cargoCode: s.cargoCode,
    cargoLabel:
      CARGOS_BY_CODE.get(s.cargoCode) ?? `Cargo ${s.cargoCode}`,
    dependenciaCode: s.dependenciaCode,
    dependenciaLabel:
      DEPENDENCIAS_BY_CODE.get(s.dependenciaCode) ??
      `Dep. ${s.dependenciaCode}`,
    fechaNacimiento: s.fechaNacimiento.toISOString(),
    carreraEgresado: s.carreraEgresado,
    status: s.status,
    currentCondicion: lastLink?.condicionContrato ?? null,
    kind,
  };
}

export async function loadQualityData(): Promise<QualityData> {
  const placeholderYear = new Date(Date.UTC(1940, 0, 1));

  const allWithIssue = await prisma.administrativeStaff.findMany({
    where: {
      OR: [
        { cargoCode: 1 },
        { dependenciaCode: 9 },
        { fechaNacimiento: { lt: placeholderYear } },
        { carreraEgresado: null },
        { carreraEgresado: "" },
      ],
    },
    include: {
      vinculos: {
        orderBy: { fechaInicio: "desc" },
        take: 1,
        select: { condicionContrato: true },
      },
    },
    orderBy: [{ primerApellido: "asc" }, { nombres: "asc" }],
  });

  const cargoPlaceholder: IssueRow[] = [];
  const dependenciaPlaceholder: IssueRow[] = [];
  const fechaNacPlaceholder: IssueRow[] = [];
  const sinCarrera: IssueRow[] = [];

  for (const s of allWithIssue) {
    if (s.cargoCode === 1)
      cargoPlaceholder.push(mapStaffToIssue(s, "cargo-placeholder"));
    if (s.dependenciaCode === 9)
      dependenciaPlaceholder.push(mapStaffToIssue(s, "dependencia-placeholder"));
    if (s.fechaNacimiento.getTime() < placeholderYear.getTime())
      fechaNacPlaceholder.push(mapStaffToIssue(s, "fecha-nac-placeholder"));
    if (!s.carreraEgresado || s.carreraEgresado.trim() === "") {
      const hasDeterminado = s.vinculos.some(
        (v) => v.condicionContrato === "DETERMINADO",
      );
      // Filtramos a los DETERMINADO que sí deberían tener carrera (egresados).
      // Los IND/CONFIANZA suelen ser personal técnico/de apoyo donde la
      // carrera no aplica obligatoriamente.
      if (hasDeterminado)
        sinCarrera.push(mapStaffToIssue(s, "sin-carrera"));
    }
  }

  // Nombres swapped: heurística mejorada con doble validación.
  // Reglas combinadas (TODAS deben cumplirse para reducir false positives):
  //   1. primer token de primerApellido ∈ NOMBRES_TIPICOS, Y
  //   2. al menos un token de `nombres` ∈ APELLIDOS_TIPICOS
  // Si solo aplica regla 1 pero los nombres son apellidos normales (sin match),
  // skip — probablemente sea apellido legítimo como JOSE o LUIS.
  const all = await prisma.administrativeStaff.findMany({
    select: {
      id: true,
      numeroDocumento: true,
      primerApellido: true,
      segundoApellido: true,
      nombres: true,
      cargoCode: true,
      dependenciaCode: true,
      fechaNacimiento: true,
      carreraEgresado: true,
      status: true,
      vinculos: {
        orderBy: { fechaInicio: "desc" },
        take: 1,
        select: { condicionContrato: true },
      },
    },
  });

  const totalStaff = all.length;

  const nombresSwapped: IssueRow[] = [];
  for (const s of all) {
    const primer = (s.primerApellido.trim().toUpperCase().split(/\s+/)[0] ?? "");
    if (!NOMBRES_TIPICOS.has(primer)) continue;
    const nombresTokens = s.nombres.trim().toUpperCase().split(/\s+/);
    const hayApellidoEnNombres = nombresTokens.some((t) =>
      APELLIDOS_TIPICOS.has(t),
    );
    if (!hayApellidoEnNombres) continue;
    nombresSwapped.push(mapStaffToIssue(s, "nombres-swapped"));
  }

  return {
    totalStaff,
    cargoPlaceholder,
    dependenciaPlaceholder,
    fechaNacPlaceholder,
    sinCarrera,
    nombresSwapped,
  };
}
