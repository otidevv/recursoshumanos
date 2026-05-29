// 2 generadores xlsx adicionales detectados en la hoja
// "informacion requerida por ofici" del xlsx CAS 2025:
//
//   - Listado oficial por unidad: formato corto para presentar a oficinas
//     externas (N° / Apellidos / DNI / Cargo / Unidad). Agrupable por
//     dependencia con separadores y subtotal.
//
//   - Resoluciones de designación: todas las designaciones activas con su
//     documento oficial (resolución de Consejo Universitario/Rectorado).

import ExcelJS from "exceljs";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function fmtDate(d: Date | null): string {
  if (!d) return "";
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

// ── 1) Listado oficial por unidad ────────────────────────────────

export type ListadoRow = {
  nombre: string;
  dni: string;
  cargo: string;
  unidad: string;
};

export async function generateListadoOficialXlsx(
  rows: ListadoRow[],
  groupByUnidad: boolean,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UNAMAD — Recursos Humanos";
  wb.created = new Date();
  const ws = wb.addWorksheet("Listado Oficial", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = [
    { header: "N°", width: 6 },
    { header: "Apellidos y Nombres", width: 38 },
    { header: "DNI", width: 12 },
    { header: "Cargo Desempeñado", width: 32 },
    { header: "Unidad / Área de Trabajo", width: 36 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF155CB8" },
  };
  head.alignment = { horizontal: "center", vertical: "middle" };
  head.height = 28;

  let counter = 1;
  if (groupByUnidad) {
    // Agrupar por unidad y emitir separadores.
    const groups = new Map<string, ListadoRow[]>();
    for (const r of rows) {
      const arr = groups.get(r.unidad) ?? [];
      arr.push(r);
      groups.set(r.unidad, arr);
    }
    const sortedUnidades = [...groups.keys()].sort();
    for (const unidad of sortedUnidades) {
      const groupRows = groups.get(unidad)!;
      // Fila separadora con el nombre de la unidad
      const sep = ws.addRow(["", unidad, `${groupRows.length} trabajadores`, "", ""]);
      sep.font = { bold: true, color: { argb: "FF155CB8" } };
      sep.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDBEAFE" },
      };
      sep.height = 22;
      ws.mergeCells(`B${sep.number}:E${sep.number}`);
      // Filas del grupo
      for (const r of groupRows) {
        const row = ws.addRow([counter++, r.nombre, r.dni, r.cargo, r.unidad]);
        row.alignment = { vertical: "middle" };
        row.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
        row.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
      }
    }
  } else {
    for (const r of rows) {
      const row = ws.addRow([counter++, r.nombre, r.dni, r.cargo, r.unidad]);
      row.alignment = { vertical: "middle" };
      row.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
      row.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
    }
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: 5 },
    };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── 2) Resoluciones de designación ───────────────────────────────

export type ResolucionRow = {
  nombre: string;
  dni: string;
  cargo: string;
  dependencia: string;
  documentoDesignacion: string;
  correo: string;
  fechaInicio: Date;
  fechaCese: Date | null;
  notaFinCargo: string | null;
};

export async function generateResolucionesXlsx(
  rows: ResolucionRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "UNAMAD — Recursos Humanos";
  wb.created = new Date();
  const ws = wb.addWorksheet("Resoluciones", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = [
    { header: "N°", width: 6 },
    { header: "DNI", width: 12 },
    { header: "Apellidos y Nombres", width: 38 },
    { header: "Cargo Desempeñado", width: 30 },
    { header: "Dependencia", width: 36 },
    { header: "Número de Resolución / Contrato", width: 42 },
    { header: "Correo", width: 28 },
    { header: "Fecha Inicio", width: 14 },
    { header: "Fecha Cese", width: 24 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF155CB8" },
  };
  head.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  head.height = 32;

  rows.forEach((r, i) => {
    const ceseLabel = r.fechaCese
      ? fmtDate(r.fechaCese)
      : r.notaFinCargo
        ? r.notaFinCargo
        : "Vigente";
    const row = ws.addRow([
      i + 1,
      r.dni,
      r.nombre,
      r.cargo,
      r.dependencia,
      r.documentoDesignacion,
      r.correo,
      fmtDate(r.fechaInicio),
      ceseLabel,
    ]);
    row.alignment = { vertical: "middle", wrapText: true };
    row.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(8).alignment = { vertical: "middle", horizontal: "center" };
    if (!r.fechaCese && r.notaFinCargo) {
      row.getCell(9).font = { italic: true, color: { argb: "FF92400E" } };
    }
  });

  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: 9 },
    };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
