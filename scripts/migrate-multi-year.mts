// Migración MULTI-AÑO de listas CAS UNAMAD al modelo
// AdministrativeStaff + StaffEmploymentLink.
//
// A diferencia de migrate-cas-xlsx.mts, este script:
//   - Acepta un solo archivo + año explícito (--year=YYYY)
//   - Es APPEND-safe: NO borra vínculos previos del trabajador. Solo crea el
//     vínculo del año indicado si no existe ya uno principal de ese año.
//   - Es MERGE-safe en datos personales: solo llena campos que están vacíos
//     en BD (no pisa los que ya tienen valor). Status sí se actualiza al
//     último xlsx procesado.
//   - Soporta 3 formatos de hoja distintos (CAS 2024 sin fechas, CAS 2025/26
//     con fechas).
//
// Uso:
//   npx tsx scripts/migrate-multi-year.mts <ruta.xlsx> --year=2024            ← dry run
//   npx tsx scripts/migrate-multi-year.mts <ruta.xlsx> --year=2024 --commit
//
// Orden recomendado para los 3 xlsx UNAMAD:
//   1) "LISTA ACTUALIZADA DE LOS CAS 2024.xlsx" --year=2024
//   2) "LISTA ACTUALIZADA DE LOS CAS 2025.xlsx" --year=2025
//   3) "LISTA ACTUALIZADA DE LOS CAS 2026.xlsx" --year=2026
//
// Re-correrlo es seguro: trabajadores y vínculos existentes no se duplican.

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

type RowVal = string | number | Date | null;
type Row = RowVal[];

// ─── Date helpers ────────────────────────────────────────────────────

function utcDate(y: number, m1to12: number, d: number): Date {
  // 12:00 UTC del día indicado → mismo Y/M/D en cualquier TZ entre ±11h.
  return new Date(Date.UTC(y, m1to12 - 1, d, 12, 0, 0));
}

function parseDate(v: RowVal): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    return utcDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 1) return null;
    const ms = (v - 25569) * 86400 * 1000;
    const utc = new Date(ms);
    if (isNaN(utc.getTime())) return null;
    return utcDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
  }
  const s = String(v).trim();
  const m1 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
  if (m1) return utcDate(Number(m1[3]), Number(m1[2]), Number(m1[1]));
  const m2 = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m2) return utcDate(Number(m2[1]), Number(m2[2]), Number(m2[3]));
  return null;
}

// ─── Parsers de campos ───────────────────────────────────────────────

function nonEmpty(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s && s !== "-" && s !== "·" ? s : null;
}

function parseName(raw: string | null): {
  primer: string;
  segundo: string;
  nombres: string;
} {
  if (!raw) return { primer: "", segundo: "", nombres: "" };
  const t = raw.trim();
  // "APELLIDO APELLIDO, Nombres" (formato CAS 2025/26)
  if (t.includes(",")) {
    const [apsRaw, nombresRaw] = t.split(",", 2);
    const aps = apsRaw.trim().toUpperCase().split(/\s+/);
    return {
      primer: aps[0] || "",
      segundo: aps.slice(1).join(" "),
      nombres: nombresRaw.trim().toUpperCase(),
    };
  }
  // "PALABRA PALABRA PALABRA PALABRA" — asumimos primer+segundo+nombres
  const parts = t.toUpperCase().split(/\s+/);
  if (parts.length === 1) return { primer: parts[0], segundo: "", nombres: "" };
  if (parts.length === 2) return { primer: parts[0], segundo: "", nombres: parts[1] };
  return {
    primer: parts[0],
    segundo: parts[1],
    nombres: parts.slice(2).join(" "),
  };
}

function parseSexo(v: unknown): 1 | 2 {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "F" || s === "FEMENINO") return 2;
  return 1; // default M
}

type Status = "ACTIVO" | "PASIVO" | "LICENCIA" | "FALLECIMIENTO";
function parseStatus(v: unknown): Status {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "INACTIVO" || s === "PASIVO" || s === "CESADO") return "PASIVO";
  if (s === "LICENCIA") return "LICENCIA";
  if (s.includes("FALLEC")) return "FALLECIMIENTO";
  return "ACTIVO"; // default
}

type Condicion = "DETERMINADO" | "INDETERMINADO" | "CONFIANZA";
function parseCondicion(v: unknown): Condicion {
  const s = String(v ?? "").trim().toUpperCase();
  if (s.includes("INDETERMINADO")) return "INDETERMINADO";
  if (s.includes("CONFIANZA")) return "CONFIANZA";
  return "DETERMINADO"; // default CAS
}

function looksLikeEmail(s: unknown): string | null {
  if (s == null) return null;
  const t = String(s).trim().toLowerCase();
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(t) ? t : null;
}

function parseCelular(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\D/g, "");
  if (s.length === 9 && s.startsWith("9")) return s;
  return null;
}

// ─── Column mappings por hoja ────────────────────────────────────────

type ColMap = {
  estado: number;
  nombre: number;
  dni: number;
  grado: number;
  grupoCarrera: number;
  carrera: number;
  sexo: number;
  cargo: number;
  condicion: number;
  regimen: number;
  plazaOrigen: number;
  plazaActual: number;
  correo: number;
  celular: number | null;
  cumpleanos: number | null;
  inicioContrato: number | null;
  terminoContrato: number | null;
  adendaIni: number | null;
  adendaFin: number | null;
};

type SheetSpec = {
  name: string;
  headerRow: number;
  cols: ColMap;
  default_condicion?: Condicion; // si la hoja no tiene CONDICION (ej. cuando es INDET separada)
};

type FileSpec = {
  filename_match: string; // substring del filename
  sheets: SheetSpec[];
};

// CAS 2024: hoja "cas" 15 cols, sin fechas.
// CAS 2025: hoja "CONCURSO CAS 2025" 23 cols con fechas + adendas. También
//           hoja "INDETERMINADOS Y CONFIANZA" (15 cols).
// CAS 2026: hoja "CONCURSO CAS 2026" con fechas. Hoja "INDETERMINADOS Y
//           CONFIANZA" 16 cols (col 4=cumpleaños, col 5=dni).
//
// El header puede estar en R1 o R2 según hoja. Lo configuro por hoja.
const FILE_SPECS: FileSpec[] = [
  {
    filename_match: "CAS 2024",
    sheets: [
      {
        name: "cas",
        headerRow: 1,
        cols: {
          estado: 2,
          nombre: 3,
          dni: 4,
          grado: 5,
          grupoCarrera: 6,
          carrera: 7,
          sexo: 8,
          cargo: 9,
          condicion: 10,
          regimen: 11,
          plazaOrigen: 12,
          plazaActual: 13,
          correo: 14,
          celular: null,
          cumpleanos: null,
          inicioContrato: null,
          terminoContrato: null,
          adendaIni: null,
          adendaFin: null,
        },
      },
    ],
  },
  {
    filename_match: "CAS 2025",
    sheets: [
      {
        name: "CONCURSO CAS 2025",
        headerRow: 1,
        cols: {
          estado: 2,
          nombre: 3,
          dni: 4,
          grado: 5,
          grupoCarrera: 6,
          carrera: 7,
          sexo: 8,
          cargo: 9, // col 9 dice CARGO, col 12 también dice CARGO (duplicado en xlsx). 9 es suficiente.
          condicion: 10,
          regimen: 11,
          plazaOrigen: 13,
          plazaActual: 14,
          celular: 15,
          correo: 16,
          cumpleanos: 18,
          inicioContrato: 19,
          terminoContrato: 20,
          adendaIni: 21,
          adendaFin: 22,
        },
      },
      {
        name: "INDETERMINADOS Y CONFIANZA",
        headerRow: 2,
        cols: {
          estado: 2,
          nombre: 3,
          dni: 4,
          grado: 5,
          grupoCarrera: 6,
          carrera: 7,
          sexo: 8,
          cargo: 9,
          condicion: 10,
          regimen: 11,
          plazaOrigen: 12,
          plazaActual: 13,
          correo: 14,
          celular: 15,
          cumpleanos: null,
          inicioContrato: null,
          terminoContrato: null,
          adendaIni: null,
          adendaFin: null,
        },
        default_condicion: "INDETERMINADO",
      },
    ],
  },
  {
    filename_match: "CAS 2026",
    sheets: [
      {
        name: "CONCURSO CAS 2026",
        headerRow: 1,
        cols: {
          estado: 2,
          nombre: 3,
          dni: 4,
          grado: 5,
          grupoCarrera: 6,
          carrera: 7,
          sexo: 8,
          condicion: 9,
          regimen: 10,
          cargo: 11,
          plazaOrigen: 12,
          plazaActual: 13,
          celular: 14,
          correo: 16, // col 15 = CORREO INSTITUCIONAL, col 16 = CORREO
          cumpleanos: 18,
          inicioContrato: 19,
          terminoContrato: 20,
          adendaIni: null,
          adendaFin: null,
        },
      },
      {
        name: "INDETERMINADOS Y CONFIANZA",
        headerRow: 2,
        cols: {
          estado: 2,
          nombre: 3,
          cumpleanos: 4,
          dni: 5,
          grado: 6,
          grupoCarrera: 7,
          carrera: 8,
          sexo: 9,
          cargo: 10,
          condicion: 11,
          regimen: 12,
          plazaOrigen: 13,
          plazaActual: 14,
          correo: 15,
          celular: 16,
          inicioContrato: null,
          terminoContrato: null,
          adendaIni: null,
          adendaFin: null,
        },
        default_condicion: "INDETERMINADO",
      },
    ],
  },
];

function detectFileSpec(filePath: string): FileSpec {
  const name = path.basename(filePath).toUpperCase();
  const match = FILE_SPECS.find((s) =>
    name.includes(s.filename_match.toUpperCase()),
  );
  if (!match) {
    throw new Error(
      `No hay spec para '${path.basename(filePath)}'. Edita FILE_SPECS para añadirlo.`,
    );
  }
  return match;
}

function readCellText(row: ExcelJS.Row, col: number): string | null {
  const v = row.getCell(col).value;
  if (v == null) return null;
  if (typeof v === "object" && "text" in v) {
    return String((v as { text: string }).text).trim() || null;
  }
  if (typeof v === "object" && "result" in v) {
    const r = (v as { result: unknown }).result;
    return r != null ? String(r).trim() : null;
  }
  if (typeof v === "object" && "richText" in v) {
    return (v as { richText: { text: string }[] }).richText
      .map((rt) => rt.text)
      .join("")
      .trim() || null;
  }
  return String(v).trim() || null;
}

function readCellRaw(row: ExcelJS.Row, col: number): RowVal {
  const v = row.getCell(col).value;
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") return v;
  if (typeof v === "object" && "result" in v) {
    const r = (v as { result: unknown }).result;
    if (r instanceof Date) return r;
    if (typeof r === "number") return r;
    return r != null ? String(r) : null;
  }
  return readCellText(row, col);
}

// ─── Main ────────────────────────────────────────────────────────────

type ParsedRow = {
  source: string;
  rowIdx: number;
  dni: string;
  full: ReturnType<typeof parseName>;
  estado: Status;
  condicion: Condicion;
  sexo: 1 | 2;
  cargoText: string | null;
  plazaOrigen: string | null;
  plazaActual: string | null;
  grado: string | null;
  grupoCarrera: string | null;
  carrera: string | null;
  correoInst: string | null;
  correoPers: string | null;
  celular: string | null;
  cumpleanos: Date | null;
  inicioContrato: Date | null;
  terminoContrato: Date | null;
  adendaInicio: Date | null;
  adendaTermino: Date | null;
};

async function main(): Promise<void> {
  const arg = process.argv[2];
  const commit = process.argv.includes("--commit");
  const yearArg = (() => {
    const flag = process.argv.find((a) => a.startsWith("--year="));
    if (!flag) return null;
    const y = Number(flag.slice("--year=".length));
    return Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : null;
  })();
  if (!arg || yearArg == null) {
    console.error(
      "Uso: npx tsx scripts/migrate-multi-year.mts <ruta.xlsx> --year=YYYY [--commit]",
    );
    process.exit(2);
  }
  const filePath = path.resolve(arg);
  if (!fs.existsSync(filePath)) {
    console.error(`Archivo no encontrado: ${filePath}`);
    process.exit(2);
  }
  const targetYear = yearArg;
  const spec = detectFileSpec(filePath);

  console.log(`Modo: ${commit ? "COMMIT (escribe en DB)" : "DRY RUN"}`);
  console.log(`Archivo: ${filePath}`);
  console.log(`Spec detectado: ${spec.filename_match}`);
  console.log(`Año objetivo (vinculo): ${targetYear}`);
  console.log();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const parsed: ParsedRow[] = [];
  const skipped: { source: string; rowIdx: number; reason: string }[] = [];

  for (const sheetSpec of spec.sheets) {
    const ws = wb.getWorksheet(sheetSpec.name);
    if (!ws) {
      console.warn(`⚠ Hoja "${sheetSpec.name}" no encontrada, saltando.`);
      continue;
    }
    const c = sheetSpec.cols;
    for (let r = sheetSpec.headerRow + 1; r <= ws.actualRowCount; r++) {
      const row = ws.getRow(r);

      const dniRaw = readCellText(row, c.dni);
      if (!dniRaw) {
        // Fila vacía o sin DNI — skip silenciosamente
        continue;
      }
      const dni = dniRaw.padStart(8, "0").replace(/\s+/g, "");
      if (!/^\d{8}$/.test(dni)) {
        skipped.push({
          source: sheetSpec.name,
          rowIdx: r,
          reason: `DNI inválido: "${dniRaw}"`,
        });
        continue;
      }

      const nombreRaw = readCellText(row, c.nombre);
      const full = parseName(nombreRaw);
      if (!full.primer && !full.nombres) {
        skipped.push({
          source: sheetSpec.name,
          rowIdx: r,
          reason: "Nombre vacío",
        });
        continue;
      }

      const condicionRaw = readCellText(row, c.condicion);
      const condicion =
        sheetSpec.default_condicion ?? parseCondicion(condicionRaw);

      const correoText = readCellText(row, c.correo);
      const correoInst = looksLikeEmail(correoText);
      // CAS 2025/2026 a veces tiene 2 cols de correo (inst+personal). Aquí
      // simplificado: correo único; lo asignamos a institucional si parece de
      // unamad.edu.pe, sino a personal.
      const isUnamad = correoInst?.endsWith("@unamad.edu.pe") ?? false;

      parsed.push({
        source: sheetSpec.name,
        rowIdx: r,
        dni,
        full,
        estado: parseStatus(readCellText(row, c.estado)),
        condicion,
        sexo: parseSexo(readCellText(row, c.sexo)),
        cargoText: nonEmpty(readCellText(row, c.cargo)),
        plazaOrigen: nonEmpty(readCellText(row, c.plazaOrigen)),
        plazaActual: nonEmpty(readCellText(row, c.plazaActual)),
        grado: nonEmpty(readCellText(row, c.grado)),
        grupoCarrera: nonEmpty(readCellText(row, c.grupoCarrera)),
        carrera: nonEmpty(readCellText(row, c.carrera)),
        correoInst: isUnamad ? correoInst : null,
        correoPers: !isUnamad ? correoInst : null,
        celular:
          c.celular != null
            ? parseCelular(readCellText(row, c.celular))
            : null,
        cumpleanos:
          c.cumpleanos != null ? parseDate(readCellRaw(row, c.cumpleanos)) : null,
        inicioContrato:
          c.inicioContrato != null
            ? parseDate(readCellRaw(row, c.inicioContrato))
            : null,
        terminoContrato:
          c.terminoContrato != null
            ? parseDate(readCellRaw(row, c.terminoContrato))
            : null,
        adendaInicio:
          c.adendaIni != null
            ? parseDate(readCellRaw(row, c.adendaIni))
            : null,
        adendaTermino:
          c.adendaFin != null
            ? parseDate(readCellRaw(row, c.adendaFin))
            : null,
      });
    }
  }

  console.log(`Filas parseadas OK: ${parsed.length}`);
  console.log(`Filas con skip:     ${skipped.length}`);
  if (skipped.length > 0) {
    console.log("Primeros 10 skips:");
    for (const s of skipped.slice(0, 10)) {
      console.log(`  ${s.source}:R${s.rowIdx} — ${s.reason}`);
    }
  }
  console.log();

  // De-duplicar dentro del mismo archivo (si el DNI aparece varias veces,
  // último gana — típicamente el más actualizado).
  const byDni = new Map<string, ParsedRow>();
  for (const r of parsed) byDni.set(r.dni, r);
  const uniqueRows = [...byDni.values()];
  console.log(`DNIs únicos en el xlsx: ${uniqueRows.length}\n`);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL no está set en .env");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  // Sede por defecto: primera local activa
  const defaultLocal = await prisma.universityLocal.findFirst({
    where: { active: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  if (!defaultLocal) throw new Error("No hay UniversityLocal activas.");

  // DNIs existentes en BD
  const existing = new Map(
    (
      await prisma.administrativeStaff.findMany({
        select: {
          id: true,
          numeroDocumento: true,
          nombres: true,
          primerApellido: true,
          segundoApellido: true,
          carreraEgresado: true,
          grupoCarrera: true,
          gradoMaximo: true,
          celular: true,
          correoInstitucional: true,
          correoPersonal: true,
          plazaOrigen: true,
          plazaActual: true,
          puestoDetallado: true,
          fechaNacimiento: true,
          vinculos: {
            select: { id: true, year: true, esAdenda: true },
          },
        },
      })
    ).map((s) => [s.numeroDocumento, s] as const),
  );

  let createdStaff = 0;
  let updatedStaff = 0;
  let createdVinculos = 0;
  let skippedVinculos = 0;
  const errors: { dni: string; reason: string }[] = [];

  const DEFAULT_UBIGEO = "160101"; // Tambopata
  const DEFAULT_DEPENDENCIA = 9;
  const DEFAULT_CARGO = 1; // placeholder hasta que el user lo ajuste
  const DEFAULT_REGIMEN = 13; // 13 = CAS según SUNEDU
  const DEFAULT_VINCULO_ACTUAL = 1; // 1 = NOMBRADO/CONTRATADO

  // Para CAS DETERMINADO sin fechas: usar año-01-01 → año-12-31
  const defaultIniDet = utcDate(targetYear, 1, 1);
  const defaultFinDet = utcDate(targetYear, 12, 31);
  // Para INDETERMINADO: año-01-01 sin término (representa el contrato vigente)
  const defaultIniIndet = utcDate(targetYear, 1, 1);

  for (const r of uniqueRows) {
    const prev = existing.get(r.dni);
    const fechaIngreso =
      r.inicioContrato ??
      (r.condicion === "DETERMINADO" ? defaultIniDet : defaultIniIndet);

    // Datos del trabajador con MERGE seguro (no pisa valores no vacíos).
    const personData = {
      tipoDocumentoCode: 1,
      numeroDocumento: r.dni,
      cargoCode: DEFAULT_CARGO,
      dependenciaCode: DEFAULT_DEPENDENCIA,
      nombres: prev?.nombres?.trim() ? prev.nombres : r.full.nombres,
      primerApellido: prev?.primerApellido?.trim()
        ? prev.primerApellido
        : r.full.primer,
      segundoApellido:
        prev?.segundoApellido?.trim() != null && prev.segundoApellido !== ""
          ? prev.segundoApellido
          : r.full.segundo || null,
      apellidoCasada: null,
      unSoloApellido: !(r.full.segundo || prev?.segundoApellido),
      condicionDiscapacidad: false,
      tipoDiscapacidadCode: null,
      sexoCode: r.sexo,
      // fechaNacimiento es REQUIRED en schema. Si no la tenemos en el xlsx,
      // usamos un placeholder muy obvio (1900-01-01) para que el user lo
      // detecte fácil después. NO pisa si ya hay valor en BD.
      fechaNacimiento:
        prev?.fechaNacimiento ?? r.cumpleanos ?? utcDate(1900, 1, 1),
      paisNacimientoCode: "PER",
      ubigeoNacimiento: null,
      ubigeoDomicilio: DEFAULT_UBIGEO,
      correoInstitucional:
        prev?.correoInstitucional?.trim() || r.correoInst || null,
      correoPersonal: prev?.correoPersonal?.trim() || r.correoPers || null,
      telefono: null,
      celular: prev?.celular?.trim() || r.celular || null,
      gradoMaximo: prev?.gradoMaximo?.trim() || r.grado || null,
      grupoCarrera: prev?.grupoCarrera?.trim() || r.grupoCarrera || null,
      carreraEgresado:
        prev?.carreraEgresado?.trim() || r.carrera || null,
      puestoDetallado: prev?.puestoDetallado?.trim() || r.cargoText || null,
      plazaOrigen: prev?.plazaOrigen?.trim() || r.plazaOrigen || null,
      plazaActual: prev?.plazaActual?.trim() || r.plazaActual || null,
      // Status: el último xlsx procesado wins
      status: r.estado,
      fechaIngresoIE: prev != null ? undefined : fechaIngreso, // solo en create
    } as const;

    if (!commit) {
      // Dry run: solo contar
      if (!prev) createdStaff++;
      else updatedStaff++;
    } else {
      try {
        const staff = await prisma.administrativeStaff.upsert({
          where: {
            tipoDocumentoCode_numeroDocumento: {
              tipoDocumentoCode: 1,
              numeroDocumento: r.dni,
            },
          },
          create: {
            ...personData,
            fechaIngresoIE: fechaIngreso,
          },
          update: {
            // Solo campos seguros para actualizar — los demás están en
            // personData con el merge ya aplicado.
            nombres: personData.nombres,
            primerApellido: personData.primerApellido,
            segundoApellido: personData.segundoApellido,
            sexoCode: personData.sexoCode,
            status: personData.status,
            correoInstitucional: personData.correoInstitucional,
            correoPersonal: personData.correoPersonal,
            celular: personData.celular,
            gradoMaximo: personData.gradoMaximo,
            grupoCarrera: personData.grupoCarrera,
            carreraEgresado: personData.carreraEgresado,
            puestoDetallado: personData.puestoDetallado,
            plazaOrigen: personData.plazaOrigen,
            plazaActual: personData.plazaActual,
          },
          select: {
            id: true,
            vinculos: { select: { year: true, esAdenda: true } },
          },
        });

        if (!prev) createdStaff++;
        else updatedStaff++;

        // Vínculo del targetYear — solo si NO existe ya uno principal
        const hasMainOfYear = staff.vinculos.some(
          (v) => v.year === targetYear && !v.esAdenda,
        );
        if (hasMainOfYear) {
          skippedVinculos++;
        } else {
          const fechaInicioVinc =
            r.inicioContrato ??
            (r.condicion === "DETERMINADO" ? defaultIniDet : defaultIniIndet);
          const fechaTerminoVinc =
            r.terminoContrato ??
            (r.condicion === "DETERMINADO" ? defaultFinDet : null);
          await prisma.staffEmploymentLink.create({
            data: {
              staffId: staff.id,
              regimenLaboralCode: DEFAULT_REGIMEN,
              vinculoActualCode: DEFAULT_VINCULO_ACTUAL,
              condicionContrato: r.condicion,
              fechaInicio: fechaInicioVinc,
              fechaTermino: fechaTerminoVinc,
              esAdenda: false,
              year: targetYear,
            },
          });
          createdVinculos++;

          // Adendas opcionales (solo si vienen en xlsx)
          if (r.adendaInicio) {
            await prisma.staffEmploymentLink.create({
              data: {
                staffId: staff.id,
                regimenLaboralCode: DEFAULT_REGIMEN,
                vinculoActualCode: DEFAULT_VINCULO_ACTUAL,
                condicionContrato: r.condicion,
                fechaInicio: r.adendaInicio,
                fechaTermino: r.adendaTermino,
                esAdenda: true,
                year: targetYear,
              },
            });
          }
        }
      } catch (e) {
        errors.push({
          dni: r.dni,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // Para dry-run: contar cuántos vínculos se crearían
  if (!commit) {
    for (const r of uniqueRows) {
      const prev = existing.get(r.dni);
      const hasMainOfYear = prev?.vinculos.some(
        (v) => v.year === targetYear && !v.esAdenda,
      ) ?? false;
      if (hasMainOfYear) skippedVinculos++;
      else createdVinculos++;
    }
  }

  console.log("─── RESUMEN ────────────────────────────────");
  console.log(`Trabajadores creados:        ${createdStaff}`);
  console.log(`Trabajadores actualizados:   ${updatedStaff}`);
  console.log(`Vínculos creados año ${targetYear}: ${createdVinculos}`);
  console.log(`Vínculos skip (ya existían): ${skippedVinculos}`);
  if (errors.length > 0) {
    console.log(`Errores DB:                  ${errors.length}`);
    for (const e of errors.slice(0, 10)) {
      console.log(`  ${e.dni}: ${e.reason.slice(0, 100)}`);
    }
  }
  console.log("────────────────────────────────────────────");
  if (!commit) {
    console.log("\nDRY RUN — nada se guardó. Vuelve a correr con --commit");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
