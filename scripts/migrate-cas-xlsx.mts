// Migración one-shot del xlsx histórico de UNAMAD (CAS + Indeterminados)
// al modelo AdministrativeStaff + StaffEmploymentLink + StaffWorkplace.
//
// Uso:
//   npx tsx scripts/migrate-cas-xlsx.mts <ruta.xlsx>           ← dry run (default)
//   npx tsx scripts/migrate-cas-xlsx.mts <ruta.xlsx> --commit  ← inserta en DB
//
// Reglas:
// - Idempotente: upsert por (tipoDocumentoCode=1, numeroDocumento). Re-correr
//   actualiza datos pero NO crea duplicados.
// - Vínculos: reemplaza los del trabajador en cada corrida (delete + recreate)
//   para mantener coherencia con el xlsx de origen.
// - DNI inválido (no 8 dígitos) o NOMBRE vacío → skip + log.

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import * as unzipper from "node:zlib";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ubigeoByCodeStrict } from "../src/lib/sunedu";

// ─── xlsx parser (raw XML, sin deps) ─────────────────────────────────
function parseXlsx(filePath: string): Map<string, (string | null)[][]> {
  // exceljs sería más limpio pero requiere setup. Usamos unzip nativo de Node.
  // Aquí leemos el zip con `node:zlib`? No, `zlib` no soporta zip directamente.
  // Usamos un truco: leer el xlsx con `fflate` no está instalado. En su lugar
  // usamos `child_process` con `unzip` o leemos los XML extraídos previamente.
  // SIMPLIFICACIÓN: asumimos que el archivo se extrajo a /tmp/cas_migrate/extracted.
  throw new Error(
    "Este script asume que el xlsx ya fue extraído. Usa la versión inline a continuación.",
  );
}

// Implementación real: usamos `exceljs` que ya está instalado (lo usa el export).
import ExcelJS from "exceljs";

type Row = (string | number | Date | null)[];
async function readXlsx(filePath: string): Promise<{ indet: Row[]; cas: Row[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const indetSheet = wb.getWorksheet("INDETERMINADOS Y CONFIANZA");
  const casSheet = wb.getWorksheet("CONCURSO CAS 2026");
  if (!indetSheet || !casSheet) {
    throw new Error("Faltan hojas requeridas en el xlsx.");
  }

  function readRows(ws: ExcelJS.Worksheet, headerRow: number): Row[] {
    const out: Row[] = [];
    ws.eachRow((row, rowNum) => {
      if (rowNum <= headerRow) return; // saltar header(s)
      const values: Row = [];
      // exceljs values arr es 1-indexed, posición 0 vacía
      const raw = row.values as ExcelJS.CellValue[];
      for (let c = 1; c < raw.length; c++) {
        const v = raw[c];
        if (v === undefined || v === null) {
          values.push(null);
        } else if (v instanceof Date) {
          values.push(v);
        } else if (
          typeof v === "object" &&
          v !== null &&
          "text" in v &&
          typeof (v as { text: unknown }).text === "string"
        ) {
          values.push((v as { text: string }).text);
        } else if (
          typeof v === "object" &&
          v !== null &&
          "result" in v
        ) {
          // Formula cell
          const r = (v as { result: unknown }).result;
          values.push(typeof r === "string" || typeof r === "number" ? r : null);
        } else if (
          typeof v === "object" &&
          v !== null &&
          "richText" in v &&
          Array.isArray((v as { richText: { text: string }[] }).richText)
        ) {
          values.push(
            (v as { richText: { text: string }[] }).richText
              .map((rt) => rt.text)
              .join(""),
          );
        } else {
          values.push(v as string | number);
        }
      }
      // Skip rows totalmente vacías
      if (values.every((x) => x === null || x === "")) return;
      out.push(values);
    });
    return out;
  }

  return {
    indet: readRows(indetSheet, 2), // headers en row 2 (row 1 es "ANEXO 1")
    cas: readRows(casSheet, 1), // headers en row 1
  };
}

// ─── Helpers de mapeo ────────────────────────────────────────────────

const CARGO_TO_CODE: Record<string, number> = {
  // 1 Profesionales científicos e intelectuales
  JEFE: 1,
  DIRECTOR: 1,
  "DIRECTOR (ADMINISTRADOR)": 1,
  MEDICO: 1,
  "ENFERMERO(A)": 1,
  ENFERMERO: 1,
  COORDINADORA: 1,
  COORDINADOR: 1,
  "ESPECIALISTA ACADEMICO": 1,
  "ESPECIALISTA ACADÉMICO": 1,
  "ESPECIALISTA LEGAL": 1,
  "ASISTENTE LEGAL": 1,
  "ESPECIALISTA EN ADQUISICIONES": 1,
  // 2 Profesionales técnicos
  "ESPECIALISTA INFORMATICO": 2,
  "ESPECIALISTA INFORMÁTICO": 2,
  "ESPECIALISTA EN REDES": 2,
  "ESPECIALISTA EN BASE DE DATOS": 2,
  "ESPECIALISTA EN SOPORTE INFORMATICO": 2,
  "ESPECIALISTA EN SOPORTE INFORMÁTICO": 2,
  "SOPORTE TECNICO": 2,
  CAMAROGRAFO: 2,
  "ASISTENTE DE ESTADISTICA E INFORMATICA": 2,
  "ASISTENTE DE ESTADÍSTICA E INFORMÁTICA": 2,
  // 3 Administrativos
  "ASISTENTE ADMINISTRATIVO": 3,
  "AUXILIAR ADMINISTRATIVO": 3,
  "ESPECIALISTA ADMINISTRATIVO": 3,
  "OPERADOR ADMINISTRATIVO": 3,
  SECRETARIA: 3,
  "SECRETARIO GENERAL": 3,
  "TECNICO ADMINISTRATIVO I": 3,
  "TECNICO ADMINISTRATIVO II": 3,
  "TÉCNICO ADMINISTRATIVO I": 3,
  "TÉCNICO ADMINISTRATIVO II": 3,
  // 4 Ocupaciones elementales / transporte
  "AGENTE DE SEGURIDAD": 4,
  "PERSONAL DE LIMPIEZA": 4,
  GUARDIAN: 4,
  CONSERJE: 4,
  JARDINERO: 4,
  CARPINTERO: 4,
  CHOFER: 4,
};

function cargoToCode(text: string | null): number {
  if (!text) return 3;
  const t = text.toUpperCase().trim();
  return CARGO_TO_CODE[t] ?? 3;
}

function parseStatus(
  text: string | null,
): "ACTIVO" | "PASIVO" | "LICENCIA" | "FALLECIMIENTO" {
  const t = (text || "").toUpperCase().trim();
  if (t === "PASIVO") return "PASIVO";
  if (t === "LICENCIA") return "LICENCIA";
  if (t === "FALLECIMIENTO") return "FALLECIMIENTO";
  return "ACTIVO";
}

function parseCondicion(
  text: string | null,
): "DETERMINADO" | "INDETERMINADO" | "CONFIANZA" {
  const t = (text || "").toUpperCase();
  if (t.includes("INDETERMINADO")) return "INDETERMINADO";
  if (t.includes("CONFIANZA")) return "CONFIANZA";
  return "DETERMINADO";
}

function parseSexo(text: string | null): 1 | 2 {
  const t = (text || "").toUpperCase().trim();
  if (t === "F" || t === "FEMENINO") return 2;
  return 1;
}

/** Parsea fechas en múltiples formatos: Date, Excel serial number, DD/MM/AAAA */
// Normaliza Y/M/D a "mediodía UTC" para evitar TZ shifts. SUNEDU fechas son
// date-only, así que cualquier shift por TZ (browser, server, Postgres
// timezone) corrompe el día mostrado. Usar 12:00 UTC garantiza el mismo Y/M/D
// en cualquier TZ entre UTC-11 y UTC+11.
function utcDate(y: number, m1to12: number, d: number): Date {
  return new Date(Date.UTC(y, m1to12 - 1, d, 12, 0, 0));
}

function parseDate(v: string | number | Date | null): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    // exceljs devuelve Date con valor UTC = midnight del día visible en Excel.
    // Re-normalizamos a 12:00 UTC del mismo día para evitar shifts.
    return utcDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === "number") {
    // Excel serial. Epoch 1899-12-30 (corrige el bug del año 1900 leap).
    if (!Number.isFinite(v) || v < 1) return null;
    const ms = (v - 25569) * 86400 * 1000;
    const utc = new Date(ms);
    if (isNaN(utc.getTime())) return null;
    return utcDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
  }
  const s = String(v).trim();
  // DD/MM/AAAA
  const m1 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m1) {
    const d = utcDate(Number(m1[3]), Number(m1[2]), Number(m1[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  // YYYY-MM-DD
  const m2 = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m2) {
    const d = utcDate(Number(m2[1]), Number(m2[2]), Number(m2[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  // Excel serial as string
  const n = Number(s);
  if (Number.isFinite(n) && n > 10000 && n < 80000) {
    const ms = (n - 25569) * 86400 * 1000;
    const utc = new Date(ms);
    if (isNaN(utc.getTime())) return null;
    return utcDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
  }
  return null;
}

/** Parse "AP1 AP2, NOMBRES" o "AP1 AP2 NOMBRES". Devuelve uppercase. */
function parseName(full: string): {
  primer: string;
  segundo: string;
  nombres: string;
} {
  const t = full.trim().replace(/\s+/g, " ");
  if (t.includes(",")) {
    const [apsRaw, nombresRaw] = t.split(",", 2);
    const aps = apsRaw.trim().toUpperCase().split(/\s+/);
    return {
      primer: aps[0] || "",
      segundo: aps.slice(1).join(" "),
      nombres: nombresRaw.trim().toUpperCase(),
    };
  }
  const parts = t.toUpperCase().split(/\s+/);
  if (parts.length === 1) return { primer: parts[0], segundo: "", nombres: "" };
  if (parts.length === 2) return { primer: parts[0], segundo: "", nombres: parts[1] };
  return {
    primer: parts[0],
    segundo: parts[1],
    nombres: parts.slice(2).join(" "),
  };
}

function looksLikeEmail(s: string | null): string | null {
  if (!s) return null;
  const t = String(s).trim().toLowerCase();
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(t) ? t : null;
}

function safeUbigeo(raw: string | number | null): string | null {
  if (raw == null) return null;
  const s = String(raw).padStart(6, "0");
  if (!/^\d{6}$/.test(s)) return null;
  return ubigeoByCodeStrict(s) ? s : null;
}

function nonEmpty(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

// ─── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const arg = process.argv[2];
  const commit = process.argv.includes("--commit");
  const yearArg = (() => {
    const flag = process.argv.find((a) => a.startsWith("--year="));
    if (!flag) return null;
    const y = Number(flag.slice("--year=".length));
    return Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : null;
  })();
  if (!arg) {
    console.error(
      "Uso: npx tsx scripts/migrate-cas-xlsx.mts <ruta.xlsx> [--commit]",
    );
    process.exit(2);
  }
  const filePath = path.resolve(arg);
  if (!fs.existsSync(filePath)) {
    console.error(`Archivo no encontrado: ${filePath}`);
    process.exit(2);
  }

  console.log(`Modo: ${commit ? "COMMIT (escribe en DB)" : "DRY RUN"}`);
  console.log(`Archivo: ${filePath}`);
  if (yearArg != null)
    console.log(`Año forzado: ${yearArg} (--year=${yearArg})`);
  console.log();

  const { indet, cas } = await readXlsx(filePath);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL no está set en .env");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  // Sede por defecto: la primera UniversityLocal activa.
  const defaultLocal = await prisma.universityLocal.findFirst({
    where: { active: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  if (!defaultLocal) {
    console.error(
      "No hay sedes activas en UniversityLocal. Corre el seed primero.",
    );
    process.exit(2);
  }
  console.log(`Sede por defecto: ${defaultLocal.code} (${defaultLocal.name})\n`);

  const DEFAULT_UBIGEO_DOMICILIO = "160101"; // Tambopata

  type ParsedRow = {
    source: "indet" | "cas";
    rowIdx: number;
    dni: string;
    full: ReturnType<typeof parseName>;
    sexoCode: 1 | 2;
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
    estado: ReturnType<typeof parseStatus>;
    condicion: ReturnType<typeof parseCondicion>;
    inicioContrato: Date | null;
    terminoContrato: Date | null;
    adendaInicio: Date | null;
    adendaTermino: Date | null;
    ubigeoNacimiento: string | null;
  };

  const skipped: { source: string; rowIdx: number; reason: string }[] = [];
  const parsed: ParsedRow[] = [];

  // ─── INDETERMINADOS (16 cols) ─────────────────────────────────────
  // 0:N° 1:ESTADO 2:NOMBRE 3:CUMPLE 4:DNI 5:GRADO 6:GRUPO 7:CARRERA
  // 8:SEXO 9:CARGO 10:CONDICION 11:REGIMEN 12:PLAZA_OR 13:PLAZA_ACT
  // 14:CORREO 15:CELULAR
  indet.forEach((r, i) => {
    const dni = nonEmpty(r[4]);
    const nombre = nonEmpty(r[2]);
    if (!dni || !/^\d{8}$/.test(dni)) {
      skipped.push({ source: "indet", rowIdx: i + 3, reason: "DNI inválido" });
      return;
    }
    if (!nombre) {
      skipped.push({
        source: "indet",
        rowIdx: i + 3,
        reason: "Nombre vacío",
      });
      return;
    }
    const correoRaw = nonEmpty(r[14]);
    const isInst = correoRaw && correoRaw.toLowerCase().includes("@unamad");
    parsed.push({
      source: "indet",
      rowIdx: i + 3,
      dni,
      full: parseName(nombre),
      sexoCode: parseSexo(nonEmpty(r[8])),
      cargoText: nonEmpty(r[9]),
      plazaOrigen: nonEmpty(r[12]),
      plazaActual: nonEmpty(r[13]),
      grado: nonEmpty(r[5]),
      grupoCarrera: nonEmpty(r[6]),
      carrera: nonEmpty(r[7]),
      correoInst: isInst ? looksLikeEmail(correoRaw) : null,
      correoPers: !isInst ? looksLikeEmail(correoRaw) : null,
      celular: nonEmpty(r[15]),
      cumpleanos: parseDate(r[3]),
      estado: parseStatus(nonEmpty(r[1])),
      condicion: parseCondicion(nonEmpty(r[10])),
      inicioContrato: null, // indeterminados no tienen fechas
      terminoContrato: null,
      adendaInicio: null,
      adendaTermino: null,
      ubigeoNacimiento: null,
    });
  });

  // ─── CAS 2026 (22 cols) ───────────────────────────────────────────
  // 0:N° 1:ESTADO 2:NOMBRE 3:DNI 4:GRADO 5:GRUPO 6:CARRERAS 7:SEXO
  // 8:CONDICION 9:REGIMEN 10:CARGO 11:PLAZA_OR 12:PLAZA_ACT
  // 13:CELULAR 14:CORREO_INST 15:CORREO 16:UBIGEO 17:CUMPLE
  // 18:INICIO 19:TERMINO 20:ADENDA_INI 21:ADENDA_FIN
  cas.forEach((r, i) => {
    const dni = nonEmpty(r[3]);
    const nombre = nonEmpty(r[2]);
    if (!dni || !/^\d{8}$/.test(dni)) {
      skipped.push({ source: "cas", rowIdx: i + 2, reason: "DNI inválido" });
      return;
    }
    if (!nombre) {
      skipped.push({ source: "cas", rowIdx: i + 2, reason: "Nombre vacío" });
      return;
    }
    parsed.push({
      source: "cas",
      rowIdx: i + 2,
      dni,
      full: parseName(nombre),
      sexoCode: parseSexo(nonEmpty(r[7])),
      cargoText: nonEmpty(r[10]),
      plazaOrigen: nonEmpty(r[11]),
      plazaActual: nonEmpty(r[12]),
      grado: nonEmpty(r[4]),
      grupoCarrera: nonEmpty(r[5]),
      carrera: nonEmpty(r[6]),
      correoInst: looksLikeEmail(nonEmpty(r[14])),
      correoPers: looksLikeEmail(nonEmpty(r[15])),
      celular: nonEmpty(r[13]),
      cumpleanos: parseDate(r[17]),
      estado: parseStatus(nonEmpty(r[1])),
      condicion: parseCondicion(nonEmpty(r[8])),
      inicioContrato: parseDate(r[18]),
      terminoContrato: parseDate(r[19]),
      adendaInicio: parseDate(r[20]),
      adendaTermino: parseDate(r[21]),
      ubigeoNacimiento: safeUbigeo(nonEmpty(r[16])),
    });
  });

  console.log(`Total filas con DNI válido: ${parsed.length}`);
  console.log(
    `  - INDETERMINADOS: ${parsed.filter((p) => p.source === "indet").length}`,
  );
  console.log(`  - CAS 2026:       ${parsed.filter((p) => p.source === "cas").length}`);
  console.log(`Filas skipped: ${skipped.length}`);
  if (skipped.length > 0) {
    skipped.slice(0, 10).forEach((s) =>
      console.log(`  - ${s.source} fila ${s.rowIdx}: ${s.reason}`),
    );
  }

  // Detectar duplicados internos en el archivo
  const dniCounts = new Map<string, number>();
  for (const p of parsed) {
    dniCounts.set(p.dni, (dniCounts.get(p.dni) || 0) + 1);
  }
  const internalDupes = [...dniCounts.entries()].filter(([, n]) => n > 1);
  if (internalDupes.length > 0) {
    console.log(`\n⚠ Duplicados internos en el xlsx (DNI repetido):`);
    internalDupes.forEach(([d, n]) => console.log(`   DNI ${d}: ${n} veces`));
  }

  // Detectar fallback de cumpleaños (requerido por schema)
  const FALLBACK_NACIMIENTO = new Date(1990, 0, 1); // 1990-01-01
  const sinCumple = parsed.filter((p) => !p.cumpleanos);
  if (sinCumple.length > 0) {
    console.log(
      `\n⚠ ${sinCumple.length} trabajadores sin fecha de nacimiento — se usará fallback 1990-01-01.`,
    );
  }

  console.log("\n─── Sample (primer trabajador parseado) ───");
  if (parsed[0]) {
    const p = parsed[0];
    console.log(JSON.stringify(p, null, 2).slice(0, 1200));
  }

  if (!commit) {
    console.log(
      "\n🟡 DRY RUN — no se escribió nada. Re-ejecuta con --commit para insertar.",
    );
    await prisma.$disconnect();
    return;
  }

  // ─── COMMIT ─────────────────────────────────────────────────────────
  console.log("\n🔴 Insertando en DB…");
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const p of parsed) {
    try {
      await prisma.$transaction(async (tx) => {
        const fechaIngreso =
          p.inicioContrato ?? new Date(2025, 0, 1); // fallback ene 2025
        const fechaNac = p.cumpleanos ?? FALLBACK_NACIMIENTO;

        const upserted = await tx.administrativeStaff.upsert({
          where: {
            tipoDocumentoCode_numeroDocumento: {
              tipoDocumentoCode: 1,
              numeroDocumento: p.dni,
            },
          },
          update: {
            nombres: p.full.nombres,
            primerApellido: p.full.primer,
            segundoApellido: p.full.segundo || null,
            unSoloApellido: !p.full.segundo,
            sexoCode: p.sexoCode,
            fechaNacimiento: fechaNac,
            cargoCode: cargoToCode(p.cargoText),
            dependenciaCode: 9, // Rectorado/Áreas de apoyo (default)
            fechaIngresoIE: fechaIngreso,
            paisNacimientoCode: "9233",
            ubigeoNacimiento: p.ubigeoNacimiento,
            ubigeoDomicilio: DEFAULT_UBIGEO_DOMICILIO,
            correoInstitucional: p.correoInst,
            correoPersonal: p.correoPers,
            celular: p.celular,
            condicionDiscapacidad: false,
            apellidoCasada: null,
            gradoMaximo: p.grado,
            grupoCarrera: p.grupoCarrera,
            carreraEgresado: p.carrera,
            puestoDetallado: p.cargoText,
            plazaOrigen: p.plazaOrigen,
            plazaActual: p.plazaActual,
            status: p.estado,
          },
          create: {
            tipoDocumentoCode: 1,
            numeroDocumento: p.dni,
            nombres: p.full.nombres,
            primerApellido: p.full.primer,
            segundoApellido: p.full.segundo || null,
            unSoloApellido: !p.full.segundo,
            sexoCode: p.sexoCode,
            fechaNacimiento: fechaNac,
            cargoCode: cargoToCode(p.cargoText),
            dependenciaCode: 9,
            fechaIngresoIE: fechaIngreso,
            paisNacimientoCode: "9233",
            ubigeoNacimiento: p.ubigeoNacimiento,
            ubigeoDomicilio: DEFAULT_UBIGEO_DOMICILIO,
            correoInstitucional: p.correoInst,
            correoPersonal: p.correoPers,
            celular: p.celular,
            condicionDiscapacidad: false,
            gradoMaximo: p.grado,
            grupoCarrera: p.grupoCarrera,
            carreraEgresado: p.carrera,
            puestoDetallado: p.cargoText,
            plazaOrigen: p.plazaOrigen,
            plazaActual: p.plazaActual,
            status: p.estado,
          },
          select: { id: true, createdAt: true, updatedAt: true },
        });

        const wasCreated =
          Math.abs(
            upserted.createdAt.getTime() - upserted.updatedAt.getTime(),
          ) < 100;
        if (wasCreated) created++;
        else updated++;

        // Reset vínculos del trabajador para que reflejen el xlsx actual
        await tx.staffEmploymentLink.deleteMany({
          where: { staffId: upserted.id },
        });

        // Contrato original. Año del vínculo = --year si se pasó, sino
        // derivado de fechaInicio.
        if (p.source === "cas" && p.inicioContrato) {
          const yMain = yearArg ?? p.inicioContrato.getFullYear();
          await tx.staffEmploymentLink.create({
            data: {
              staffId: upserted.id,
              regimenLaboralCode: 4,
              vinculoActualCode: p.adendaInicio ? 2 : 1,
              fechaInicio: p.inicioContrato,
              fechaTermino: p.terminoContrato,
              condicionContrato: "DETERMINADO",
              esAdenda: false,
              year: yMain,
            },
          });
          if (p.adendaInicio) {
            await tx.staffEmploymentLink.create({
              data: {
                staffId: upserted.id,
                regimenLaboralCode: 4,
                vinculoActualCode: 1,
                fechaInicio: p.adendaInicio,
                fechaTermino: p.adendaTermino,
                condicionContrato: "DETERMINADO",
                esAdenda: true,
                year: yearArg ?? p.adendaInicio.getFullYear(),
              },
            });
          }
        } else if (p.source === "indet") {
          await tx.staffEmploymentLink.create({
            data: {
              staffId: upserted.id,
              regimenLaboralCode: 4,
              vinculoActualCode: 1,
              fechaInicio: fechaIngreso,
              fechaTermino: null,
              condicionContrato: p.condicion, // INDETERMINADO o CONFIANZA
              esAdenda: false,
              year: yearArg ?? fechaIngreso.getFullYear(),
            },
          });
        }

        // Workplace por defecto (SL01) si no existe ninguno
        const wpCount = await tx.staffWorkplace.count({
          where: { staffId: upserted.id },
        });
        if (wpCount === 0) {
          await tx.staffWorkplace.create({
            data: {
              staffId: upserted.id,
              otroLocal: false,
              localId: defaultLocal.id,
              ubigeoLocal: null,
              direccion: null,
            },
          });
        }
      });
    } catch (e) {
      errors++;
      console.error(`  ✗ DNI ${p.dni} (${p.source}#${p.rowIdx}):`, e);
    }
  }

  console.log(
    `\n✓ Resultado: ${created} creados, ${updated} actualizados, ${errors} errores`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Migración falló:", e);
  process.exit(1);
});

// Silencio warning de import sin uso (mantengo para futura referencia)
void unzipper;
