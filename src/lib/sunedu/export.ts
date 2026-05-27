// Generates a SUNEDU-compliant xlsx by opening the official template
// (preserves the AYUDA and MAESTRO sheets pixel-perfect) and writing the
// three transactional sheets — INFORMACIÓN GENERAL, VÍNCULO LABORAL,
// LOCAL — starting at row 2.
//
// This module imports node:fs so any client-side import will fail at
// build time — that's a sufficient safety net.

import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

import { TIPOS_DOCUMENTO_BY_CODE } from "./catalogs";

export type StaffExportRow = {
  cargoCode: number;
  dependenciaCode: number;
  fechaIngresoIE: Date;
  tipoDocumentoCode: number;
  numeroDocumento: string;
  nombres: string;
  primerApellido: string;
  segundoApellido: string | null;
  apellidoCasada: string | null;
  unSoloApellido: boolean;
  condicionDiscapacidad: boolean;
  tipoDiscapacidadCode: number | null;
  sexoCode: number;
  fechaNacimiento: Date;
  paisNacimientoCode: string;
  ubigeoNacimiento: string | null;
  ubigeoDomicilio: string;
  correoInstitucional: string | null;
  correoPersonal: string | null;
  telefono: string | null;
  celular: string | null;
  vinculos: {
    regimenLaboralCode: number;
    vinculoActualCode: number;
    fechaInicio: Date;
    fechaTermino: Date | null;
  }[];
  workplaces: {
    otroLocal: boolean;
    localCode: string | null;
    ubigeoLocal: string | null;
    direccion: string | null;
  }[];
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** SUNEDU dates must be DD/MM/AAAA strings.
 *  Usamos componentes UTC para que el día emitido coincida exactamente con
 *  el Y/M/D guardado, sin importar la TZ del proceso Node que genere el
 *  xlsx (relevante si el server corre en UTC pero los datos se ingresaron
 *  en Lima). */
function fmtDate(d: Date): string {
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function bool01(b: boolean): number {
  return b ? 1 : 0;
}

/**
 * Returns a Buffer of an xlsx file matching SUNEDU SIU "Carga Masiva General"
 * format. Throws if the template is missing or has been tampered with.
 */
export async function generateSuneduXlsx(
  staff: StaffExportRow[],
): Promise<Buffer> {
  const templatePath = path.join(
    process.cwd(),
    "src",
    "lib",
    "sunedu",
    "template.xlsx",
  );
  const templateBuffer = await readFile(templatePath);

  const wb = new ExcelJS.Workbook();
  // exceljs's older type defs disagree with Node 24 Buffer<ArrayBuffer>; the
  // runtime accepts it fine.
  await wb.xlsx.load(templateBuffer as unknown as ExcelJS.Buffer);

  const sheetInfo = wb.getWorksheet("INFORMACIÓN GENERAL");
  const sheetVinc = wb.getWorksheet("VÍNCULO LABORAL");
  const sheetLocal = wb.getWorksheet("LOCAL");

  if (!sheetInfo || !sheetVinc || !sheetLocal) {
    throw new Error(
      "Template SUNEDU corrupto: faltan hojas requeridas (INFORMACIÓN GENERAL, VÍNCULO LABORAL, LOCAL).",
    );
  }

  // Clear any pre-existing data rows below the header (template typically
  // ships empty but we want to be defensive in case it was edited).
  const clearBelowHeader = (ws: ExcelJS.Worksheet) => {
    const last = ws.actualRowCount;
    for (let r = last; r >= 2; r--) ws.spliceRows(r, 1);
  };
  clearBelowHeader(sheetInfo);
  clearBelowHeader(sheetVinc);
  clearBelowHeader(sheetLocal);

  let infoRow = 2;
  let vincRow = 2;
  let localRow = 2;

  for (const s of staff) {
    // Sanity-check the doc type so we don't write garbage rows.
    if (!TIPOS_DOCUMENTO_BY_CODE.has(s.tipoDocumentoCode)) continue;

    // ── INFORMACIÓN GENERAL ─────────────────────────────────────
    sheetInfo.getRow(infoRow).values = [
      s.cargoCode,
      s.dependenciaCode,
      fmtDate(s.fechaIngresoIE),
      s.tipoDocumentoCode,
      s.numeroDocumento,
      s.nombres,
      s.primerApellido,
      s.segundoApellido ?? "",
      s.apellidoCasada ?? "",
      bool01(s.unSoloApellido),
      bool01(s.condicionDiscapacidad),
      s.condicionDiscapacidad ? (s.tipoDiscapacidadCode ?? "") : "",
      s.sexoCode,
      fmtDate(s.fechaNacimiento),
      s.paisNacimientoCode,
      s.ubigeoNacimiento ?? "",
      s.ubigeoDomicilio,
      s.correoInstitucional ?? "",
      s.correoPersonal ?? "",
      s.telefono ?? "",
      s.celular ?? "",
    ];
    sheetInfo.getRow(infoRow).commit();
    infoRow++;

    // ── VÍNCULO LABORAL (1:N) ───────────────────────────────────
    for (const v of s.vinculos) {
      sheetVinc.getRow(vincRow).values = [
        s.tipoDocumentoCode,
        s.numeroDocumento,
        v.regimenLaboralCode,
        v.vinculoActualCode,
        fmtDate(v.fechaInicio),
        v.fechaTermino ? fmtDate(v.fechaTermino) : "",
      ];
      sheetVinc.getRow(vincRow).commit();
      vincRow++;
    }

    // ── LOCAL (1:N) ─────────────────────────────────────────────
    for (const w of s.workplaces) {
      sheetLocal.getRow(localRow).values = [
        s.tipoDocumentoCode,
        s.numeroDocumento,
        w.otroLocal ? "" : (w.localCode ?? ""),
        bool01(w.otroLocal),
        w.otroLocal ? (w.ubigeoLocal ?? "") : "",
        w.otroLocal ? (w.direccion ?? "") : "",
      ];
      sheetLocal.getRow(localRow).commit();
      localRow++;
    }
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
