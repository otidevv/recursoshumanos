export type DesignationStatus = "VIGENTE" | "FINALIZADA" | "INDEFINIDA";

export type DesignationRow = {
  id: string;
  staffId: string | null;
  dni: string;
  nombreCompleto: string;
  dependencia: string;
  cargoDesempenado: string;
  documentoDesignacion: string | null;
  correo: string | null;
  fechaInicio: string; // ISO
  fechaCese: string | null;
  notaFinCargo: string | null;

  // Derivado en el loader (no en BD):
  // - VIGENTE: fechaCese null y notaFinCargo null/sin condición
  //            o fechaCese > hoy
  // - INDEFINIDA: fechaCese null pero hay notaFinCargo ("Hasta que…")
  // - FINALIZADA: fechaCese <= hoy
  status: DesignationStatus;
  // Días desde la fechaInicio hasta hoy (o hasta fechaCese si finalizó).
  duracionDias: number;
};

export type DesignationInput = {
  staffId: string | null;
  dni: string;
  nombreCompleto: string;
  dependencia: string;
  cargoDesempenado: string;
  documentoDesignacion: string;
  correo: string;
  fechaInicio: string; // YYYY-MM-DD
  fechaCese: string; // YYYY-MM-DD o vacío
  notaFinCargo: string;
};

export type DesignationActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };
