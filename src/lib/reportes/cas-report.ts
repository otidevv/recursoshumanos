// Generador del REPORTE INTERNO UNAMAD de personal CAS Determinado.
//
// No es el formato SUNEDU SIU — es un xlsx descriptivo con 9 columnas para
// uso interno (planillas, reportes a Recursos Humanos, validación CONADIS,
// etc.). Una fila por trabajador.
//
// Columnas (en orden):
//   1. Grado académico              (Bachiller / Título Profesional / Magíster)
//   2. Nombre completo              (APELLIDOS, NOMBRES — como en DNI)
//   3. DNI                          (8 dígitos)
//   4. Celular                      (número de contacto)
//   5. Escuela Profesional          (carrera de egreso — ej. "Ingeniería de Sistemas e Informática")
//   6. Oficina o unidad             (oficina SUNEDU mapeada por dependenciaCode)
//   7. Vínculo Vigente con UNAMAD   ("Sí" / "Sí (con licencia)" / "No")
//   8. Fecha de vínculo             (inicio del contrato CAS vigente, DD/MM/YYYY)
//   9. Tipo de Nombramiento         ("CAS – DL N° 1057")

import ExcelJS from "exceljs";

export type CasReportRow = {
  gradoMaximo: string | null;
  nombreCompleto: string;
  dni: string;
  celular: string | null;
  escuelaProfesional: string | null;
  oficina: string;
  status: "ACTIVO" | "PASIVO" | "LICENCIA" | "FALLECIMIENTO";
  fechaVinculo: Date | null;
  // Tipo de nombramiento se deriva (siempre CAS para este reporte), pero lo
  // dejamos overrideable por si en el futuro extendemos a otros regímenes.
  tipoNombramiento?: string;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** DD/MM/AAAA usando componentes UTC (TZ-safe, igual que SUNEDU export). */
function fmtDate(d: Date | null): string {
  if (!d) return "";
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/**
 * Mapeo de los grados internos heterogéneos de la BD a las 3 categorías
 * canónicas del reporte (Bachiller / Título Profesional / Magíster) más un
 * fallback "Otro" que conserva el valor original cuando no encaja.
 *
 * UNAMAD trae valores legacy como "BACHILLER", "TITULO", "INGENIERO", "ABOGADO",
 * "MAGISTER", "DOCTOR" y "SECUNDARIA". La normalización es:
 *   BACHILLER                                                → "Bachiller"
 *   TITULO/INGENIERO/ABOGADO/LICENCIADO/CONTADOR/...         → "Título Profesional"
 *   MAGISTER/MAESTRO                                         → "Magíster"
 *   DOCTOR                                                   → "Doctor"
 *   otros (SECUNDARIA, TECNICO, EGRESADO...)                 → tal cual (capitalizado)
 */
function normalizeGrado(raw: string | null): string {
  if (!raw) return "";
  const s = raw.trim().toUpperCase();
  if (s === "BACHILLER") return "Bachiller";
  if (s === "MAGISTER" || s === "MAESTRO" || s === "MAGISTRA") return "Magíster";
  if (s === "DOCTOR" || s === "DOCTORA") return "Doctor";
  // Títulos profesionales reconocidos como equivalentes a "Título Profesional"
  // según la Ley Universitaria 30220 (todos egresan con título habilitante).
  const TITULOS_EQUIV = new Set([
    "TITULO",
    "TITULADA",
    "TITULADO",
    "INGENIERO",
    "INGENIERA",
    "ABOGADO",
    "ABOGADA",
    "LICENCIADO",
    "LICENCIADA",
    "CONTADOR PUBLICO",
    "CONTADORA PUBLICA",
    "MEDICO",
    "MEDICA",
    "ARQUITECTO",
    "ARQUITECTA",
  ]);
  if (TITULOS_EQUIV.has(s)) return "Título Profesional";
  // Para el resto (SECUNDARIA, TECNICO, EGRESADO, etc.) capitalizamos.
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "ACTIVO" → "Sí", "LICENCIA" → "Sí (con licencia)", otros → "No" */
function vinculoVigenteLabel(
  status: CasReportRow["status"],
): { label: string; color: "green" | "amber" | "red" } {
  if (status === "ACTIVO") return { label: "Sí", color: "green" };
  if (status === "LICENCIA")
    return { label: "Sí (con licencia)", color: "amber" };
  if (status === "FALLECIMIENTO")
    return { label: "No (fallecido)", color: "red" };
  return { label: "No", color: "red" };
}

const HEADERS = [
  "Grado Académico",
  "Nombre Completo",
  "DNI",
  "Celular",
  "Escuela Profesional",
  "Oficina o Unidad",
  "Vínculo Vigente",
  "Fecha de Vínculo",
  "Tipo de Nombramiento",
] as const;

const COLUMN_WIDTHS = [22, 38, 12, 14, 42, 38, 18, 14, 28];

export async function generateCasReportXlsx(
  rows: CasReportRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UNAMAD — Recursos Humanos";
  wb.created = new Date();

  const ws = wb.addWorksheet("Personal CAS", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = HEADERS.map((h, i) => ({
    header: h,
    width: COLUMN_WIDTHS[i],
  }));

  // Estilo del header
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF155CB8" }, // --accent-strong
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: "FF155CB8" } },
      left: { style: "thin", color: { argb: "FF155CB8" } },
      bottom: { style: "thin", color: { argb: "FF155CB8" } },
      right: { style: "thin", color: { argb: "FF155CB8" } },
    };
  });

  // Filas
  for (const r of rows) {
    const v = vinculoVigenteLabel(r.status);
    const row = ws.addRow([
      normalizeGrado(r.gradoMaximo),
      r.nombreCompleto,
      r.dni,
      r.celular ?? "",
      r.escuelaProfesional ?? "",
      r.oficina,
      v.label,
      fmtDate(r.fechaVinculo),
      r.tipoNombramiento ?? "CAS – DL N° 1057",
    ]);

    row.alignment = { vertical: "middle", wrapText: true };
    row.height = 22;

    // Color de "Vínculo Vigente"
    const vinculoCell = row.getCell(7);
    const colorByState: Record<typeof v.color, string> = {
      green: "FF065F46",
      amber: "FF92400E",
      red: "FF991B1B",
    };
    const bgByState: Record<typeof v.color, string> = {
      green: "FFD1FAE5",
      amber: "FFFEF3C7",
      red: "FFFEE2E2",
    };
    vinculoCell.font = { bold: true, color: { argb: colorByState[v.color] } };
    vinculoCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: bgByState[v.color] },
    };
    vinculoCell.alignment = { vertical: "middle", horizontal: "center" };

    // DNI y fecha centrados
    row.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(8).alignment = { vertical: "middle", horizontal: "center" };

    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
  }

  // AutoFilter sobre el rango con datos
  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: HEADERS.length },
    };
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
