// 3 generadores xlsx adicionales para el módulo /personal/reportes:
//   - Cumpleaños del mes
//   - Directorio administrativo
//   - Antigüedad del personal

import ExcelJS from "exceljs";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function fmtDate(d: Date | null): string {
  if (!d) return "";
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

// ── 1) Cumpleaños del mes ─────────────────────────────────────────

export type CumpleRow = {
  nombre: string;
  dni: string;
  oficina: string;
  cargo: string;
  fechaNacimiento: Date;
  diaCumple: string; // "12/05"
  edadACumplir: number;
};

export async function generateCumpleanosXlsx(
  rows: CumpleRow[],
  mes: number,
): Promise<Buffer> {
  const MESES = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const wb = new ExcelJS.Workbook();
  wb.creator = "UNAMAD — Recursos Humanos";
  wb.created = new Date();
  const ws = wb.addWorksheet(`Cumpleaños ${MESES[mes - 1]}`, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = [
    { header: "Nombre Completo", width: 40 },
    { header: "DNI", width: 12 },
    { header: "Oficina / Dependencia", width: 36 },
    { header: "Cargo", width: 32 },
    { header: "Día de Cumpleaños", width: 18 },
    { header: "Edad a Cumplir", width: 16 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF155CB8" } };
  head.alignment = { horizontal: "center", vertical: "middle" };
  head.height = 28;

  for (const r of rows) {
    const row = ws.addRow([
      r.nombre,
      r.dni,
      r.oficina,
      r.cargo,
      r.diaCumple,
      r.edadACumplir,
    ]);
    row.alignment = { vertical: "middle" };
    row.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(5).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(6).alignment = { vertical: "middle", horizontal: "center" };
  }

  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: 6 },
    };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── 2) Directorio administrativo ─────────────────────────────────

export type DirectorioRow = {
  oficina: string;
  nombre: string;
  dni: string;
  cargo: string;
  correoInstitucional: string;
  correoPersonal: string;
  celular: string;
};

export async function generateDirectorioXlsx(
  rows: DirectorioRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UNAMAD — Recursos Humanos";
  wb.created = new Date();
  const ws = wb.addWorksheet("Directorio", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = [
    { header: "Oficina / Dependencia", width: 38 },
    { header: "Nombre Completo", width: 38 },
    { header: "DNI", width: 12 },
    { header: "Cargo", width: 30 },
    { header: "Correo Institucional", width: 30 },
    { header: "Correo Personal", width: 30 },
    { header: "Celular", width: 14 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF155CB8" } };
  head.alignment = { horizontal: "center", vertical: "middle" };
  head.height = 28;

  for (const r of rows) {
    const row = ws.addRow([
      r.oficina,
      r.nombre,
      r.dni,
      r.cargo,
      r.correoInstitucional,
      r.correoPersonal,
      r.celular,
    ]);
    row.alignment = { vertical: "middle" };
    row.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(7).alignment = { vertical: "middle", horizontal: "center" };
  }

  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: 7 },
    };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── 3) Antigüedad del personal ───────────────────────────────────

export type AntiguedadRow = {
  nombre: string;
  dni: string;
  oficina: string;
  cargo: string;
  fechaIngresoIE: Date;
  condicionVigente: string;
  aniosAntiguedad: number;
  mesesExtra: number;
};

export async function generateAntiguedadXlsx(
  rows: AntiguedadRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UNAMAD — Recursos Humanos";
  wb.created = new Date();
  const ws = wb.addWorksheet("Antigüedad", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = [
    { header: "Nombre Completo", width: 38 },
    { header: "DNI", width: 12 },
    { header: "Oficina / Dependencia", width: 30 },
    { header: "Cargo", width: 28 },
    { header: "Condición", width: 18 },
    { header: "Fecha Ingreso", width: 14 },
    { header: "Años", width: 8 },
    { header: "Meses Extra", width: 12 },
    { header: "Antigüedad Total", width: 22 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF155CB8" } };
  head.alignment = { horizontal: "center", vertical: "middle" };
  head.height = 28;

  for (const r of rows) {
    const totalLabel =
      r.mesesExtra > 0
        ? `${r.aniosAntiguedad} años, ${r.mesesExtra} meses`
        : `${r.aniosAntiguedad} años`;
    const row = ws.addRow([
      r.nombre,
      r.dni,
      r.oficina,
      r.cargo,
      r.condicionVigente,
      fmtDate(r.fechaIngresoIE),
      r.aniosAntiguedad,
      r.mesesExtra,
      totalLabel,
    ]);
    row.alignment = { vertical: "middle" };
    row.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(6).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(7).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(8).alignment = { vertical: "middle", horizontal: "center" };
  }

  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: 9 },
    };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
