// Migración de la hoja "PEDIDO DE PAD" del xlsx UNAMAD a la tabla
// StaffDesignation. El nombre de la hoja es engañoso — son DESIGNACIONES de
// confianza, no PADs (Procesos Administrativos Disciplinarios).
//
// Uso:
//   npx tsx scripts/migrate-designaciones.mts <ruta.xlsx>            ← dry run
//   npx tsx scripts/migrate-designaciones.mts <ruta.xlsx> --commit
//
// Idempotente: matcha por (dni + fechaInicio). Re-correr no duplica.

import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import ExcelJS from "exceljs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

function utcDate(y: number, m1to12: number, d: number): Date {
  return new Date(Date.UTC(y, m1to12 - 1, d, 12, 0, 0));
}

function parseDate(v: unknown): Date | null {
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
    return (
      (v as { richText: { text: string }[] }).richText
        .map((rt) => rt.text)
        .join("")
        .trim() || null
    );
  }
  return String(v).trim() || null;
}

function readCellRaw(row: ExcelJS.Row, col: number): unknown {
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

async function main() {
  const arg = process.argv[2];
  const commit = process.argv.includes("--commit");
  if (!arg) {
    console.error(
      "Uso: npx tsx scripts/migrate-designaciones.mts <ruta.xlsx> [--commit]",
    );
    process.exit(2);
  }
  const filePath = path.resolve(arg);
  if (!fs.existsSync(filePath)) {
    console.error(`Archivo no encontrado: ${filePath}`);
    process.exit(2);
  }

  console.log(`Modo: ${commit ? "COMMIT" : "DRY RUN"}`);
  console.log(`Archivo: ${filePath}\n`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet("PEDIDO DE PAD");
  if (!ws) {
    console.error("Hoja 'PEDIDO DE PAD' no encontrada en el xlsx.");
    process.exit(2);
  }

  // Header en R2 (R1 es título "ANEXO 1: RELACION ...").
  // Cols: N° | APELLIDOS Y NOMBRE | DNI | DEPENDENCIA | CARGO DESEMPEÑADO |
  //       DOCUMENTO DE DESIGNACION | CORREO | FECHA DE INICIO | FECHA DE CESE
  const HEADER_ROW = 2;

  type Parsed = {
    rowIdx: number;
    nombre: string;
    dni: string;
    dependencia: string;
    cargo: string;
    documento: string | null;
    correo: string | null;
    fechaInicio: Date;
    fechaCese: Date | null;
    notaFinCargo: string | null;
  };
  const parsed: Parsed[] = [];
  const skipped: { rowIdx: number; reason: string }[] = [];

  for (let r = HEADER_ROW + 1; r <= ws.actualRowCount; r++) {
    const row = ws.getRow(r);
    const dniRaw = readCellText(row, 3);
    if (!dniRaw) continue;
    const dni = dniRaw.replace(/\s+/g, "").padStart(8, "0");
    if (!/^\d{8}$/.test(dni)) {
      skipped.push({ rowIdx: r, reason: `DNI inválido: "${dniRaw}"` });
      continue;
    }
    const nombre = readCellText(row, 2);
    if (!nombre) {
      skipped.push({ rowIdx: r, reason: "Nombre vacío" });
      continue;
    }
    const fechaInicio = parseDate(readCellRaw(row, 8));
    if (!fechaInicio) {
      skipped.push({ rowIdx: r, reason: "fecha de inicio inválida o vacía" });
      continue;
    }

    // FECHA DE CESE puede ser una fecha real o una nota textual ("Hasta que
    // la autoridad designe nuevo titular"). Si es texto, va al notaFinCargo.
    const ceseRaw = readCellRaw(row, 9);
    const fechaCese = parseDate(ceseRaw);
    const ceseText = readCellText(row, 9);
    const notaFinCargo =
      !fechaCese && ceseText && ceseText.length > 0 ? ceseText : null;

    // CORREO puede venir como hyperlink object {hyperlink, text}
    const correoCell = row.getCell(7).value;
    let correo: string | null = null;
    if (correoCell && typeof correoCell === "object") {
      if ("hyperlink" in correoCell) {
        const h = (correoCell as { hyperlink: string }).hyperlink ?? "";
        correo = h.replace(/^mailto:/i, "").trim() || null;
      } else if ("text" in correoCell) {
        correo = (correoCell as { text: string }).text?.trim() || null;
      }
    } else if (correoCell) {
      correo = String(correoCell).trim() || null;
    }

    parsed.push({
      rowIdx: r,
      nombre,
      dni,
      dependencia: readCellText(row, 4) ?? "(sin especificar)",
      cargo: readCellText(row, 5) ?? "(sin especificar)",
      documento: readCellText(row, 6),
      correo,
      fechaInicio,
      fechaCese,
      notaFinCargo,
    });
  }

  console.log(`Filas parseadas OK: ${parsed.length}`);
  if (skipped.length > 0) {
    console.log(`Filas saltadas: ${skipped.length}`);
    for (const s of skipped) console.log(`  R${s.rowIdx} — ${s.reason}`);
  }
  console.log();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL no set en .env");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  // Mapeo DNI → staffId (para llenar el FK opcional).
  const allStaff = await prisma.administrativeStaff.findMany({
    select: { id: true, numeroDocumento: true },
  });
  const staffByDni = new Map(allStaff.map((s) => [s.numeroDocumento, s.id]));

  let created = 0;
  let skippedDup = 0;
  let unmatched = 0;

  for (const r of parsed) {
    const staffId = staffByDni.get(r.dni) ?? null;
    if (!staffId) unmatched++;

    if (!commit) {
      // Dry run: contar
      created++;
      continue;
    }

    // Idempotencia: matcha por dni + fechaInicio (no debería haber 2
    // designaciones del mismo DNI en exactamente el mismo día).
    const exists = await prisma.staffDesignation.findFirst({
      where: { dni: r.dni, fechaInicio: r.fechaInicio },
      select: { id: true },
    });
    if (exists) {
      skippedDup++;
      continue;
    }

    await prisma.staffDesignation.create({
      data: {
        staffId,
        dni: r.dni,
        nombreCompleto: r.nombre,
        dependencia: r.dependencia,
        cargoDesempenado: r.cargo,
        documentoDesignacion: r.documento,
        correo: r.correo,
        fechaInicio: r.fechaInicio,
        fechaCese: r.fechaCese,
        notaFinCargo: r.notaFinCargo,
      },
    });
    created++;
  }

  console.log("─── RESUMEN ────────────────────────────────");
  console.log(`Designaciones creadas:         ${created}`);
  console.log(`Sin match a Personal (FK null): ${unmatched}`);
  console.log(`Skip por duplicado (idempot.): ${skippedDup}`);
  console.log("────────────────────────────────────────────");
  if (!commit) console.log("\nDRY RUN — nada se guardó. Re-corre con --commit");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
