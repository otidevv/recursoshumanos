export type StaffCondition = "DETERMINADO" | "INDETERMINADO" | "CONFIANZA";
export type StaffVariant = "all" | "cas" | "indeterminado" | "confianza";
export type StaffStatus = "ACTIVO" | "PASIVO" | "LICENCIA" | "FALLECIMIENTO";

/** Resumen de un vínculo (contrato original o adenda) para mostrar la
 *  cronología en el modal de edición. */
export type AdendaSummary = {
  id: string;
  fechaInicio: string; // ISO
  fechaTermino: string | null;
  esAdenda: boolean;
};

export const STAFF_STATUSES: readonly StaffStatus[] = [
  "ACTIVO",
  "PASIVO",
  "LICENCIA",
  "FALLECIMIENTO",
];

export type StaffCeseMotivo =
  | "RENUNCIA"
  | "FIN_CONTRATO"
  | "DESTITUCION_DESPIDO"
  | "JUBILACION"
  | "ABANDONO"
  | "FALLECIMIENTO"
  | "OTRO";

export const STAFF_CESE_MOTIVOS: readonly StaffCeseMotivo[] = [
  "RENUNCIA",
  "FIN_CONTRATO",
  "DESTITUCION_DESPIDO",
  "JUBILACION",
  "ABANDONO",
  "FALLECIMIENTO",
  "OTRO",
];

export const CESE_MOTIVO_LABELS: Record<StaffCeseMotivo, string> = {
  RENUNCIA: "Renuncia",
  FIN_CONTRATO: "Fin de contrato",
  DESTITUCION_DESPIDO: "Destitución / Despido",
  JUBILACION: "Jubilación",
  ABANDONO: "Abandono de cargo",
  FALLECIMIENTO: "Fallecimiento",
  OTRO: "Otro",
};

// Estados que representan una baja → requieren datos de cese (fecha + motivo).
export const CESE_STATUSES: readonly StaffStatus[] = [
  "PASIVO",
  "FALLECIMIENTO",
];

export type StaffRow = {
  id: string;
  cargoCode: number;
  cargoLabel: string;
  dependenciaCode: number;
  dependenciaLabel: string;
  tipoDocumentoCode: number;
  tipoDocumentoLabel: string;
  numeroDocumento: string;
  nombres: string;
  primerApellido: string;
  segundoApellido: string | null;
  apellidoCasada: string | null;
  unSoloApellido: boolean;
  condicionDiscapacidad: boolean;
  tipoDiscapacidadCode: number | null;
  fullName: string;
  sexoCode: number;
  fechaIngresoIE: string; // ISO
  fechaNacimiento: string; // ISO
  paisNacimientoCode: string;
  ubigeoNacimiento: string | null;
  ubigeoDomicilio: string;
  correoInstitucional: string | null;
  correoPersonal: string | null;
  telefono: string | null;
  celular: string | null;

  // UNAMAD metadata (no SUNEDU)
  gradoMaximo: string | null;
  grupoCarrera: string | null;
  carreraEgresado: string | null;
  puestoDetallado: string | null;
  plazaOrigen: string | null;
  plazaActual: string | null;

  // Derived from the current (most recent) employment link
  currentCondicion: StaffCondition | null;
  currentRegimenLaboralCode: number | null;
  currentRegimenLaboralLabel: string | null;

  // Contrato VIGENTE = el main (esAdenda=false) más reciente cronológico.
  // Si el trabajador tiene contratos 2024 + 2025 + 2026, vigente = 2026.
  contractInicio: string | null;
  contractTermino: string | null;
  // Año del contrato vigente (típicamente fechaInicio.getFullYear()).
  currentYear: number | null;
  // Adendas SOLO del año del contrato vigente (no de años anteriores).
  latestAdendaInicio: string | null;
  latestAdendaTermino: string | null;
  adendasCount: number;
  // Timeline COMPLETO de TODOS los vínculos (todos los años + sus adendas)
  // para mostrar el historial en el modal.
  adendas: AdendaSummary[];
  // Años en los que el trabajador tuvo al menos un vínculo (orden ASC).
  // Usado para mostrar tabs/chips de filtrado por año.
  availableYears: number[];

  status: StaffStatus;
  // Datos de cese / baja (null si el trabajador está ACTIVO/LICENCIA).
  fechaCese: string | null; // ISO
  motivoCese: StaffCeseMotivo | null;
  documentoCese: string | null;
  vinculosCount: number;
  workplacesCount: number;
  createdAt: string;
  updatedAt: string;
};

export type StaffDetail = StaffRow & {
  apellidoCasada: string | null;
  unSoloApellido: boolean;
  condicionDiscapacidad: boolean;
  tipoDiscapacidadCode: number | null;
  paisNacimientoCode: string;
  ubigeoNacimiento: string | null;
  ubigeoDomicilio: string;
  correoPersonal: string | null;
  telefono: string | null;
  celular: string | null;
  vinculos: VinculoRow[];
  workplaces: WorkplaceRow[];
};

export type VinculoRow = {
  id: string;
  regimenLaboralCode: number;
  regimenLaboralLabel: string;
  vinculoActualCode: number;
  fechaInicio: string;
  fechaTermino: string | null;
};

export type WorkplaceRow = {
  id: string;
  otroLocal: boolean;
  localId: string | null;
  localCode: string | null;
  localName: string | null;
  ubigeoLocal: string | null;
  ubigeoLocalLabel: string | null;
  direccion: string | null;
};

export type StaffInput = {
  cargoCode: number;
  dependenciaCode: number;
  fechaIngresoIE: string; // YYYY-MM-DD
  tipoDocumentoCode: number;
  numeroDocumento: string;
  nombres: string;
  primerApellido: string;
  segundoApellido: string;
  apellidoCasada: string;
  unSoloApellido: boolean;
  condicionDiscapacidad: boolean;
  tipoDiscapacidadCode: number | null;
  sexoCode: number;
  fechaNacimiento: string; // YYYY-MM-DD
  paisNacimientoCode: string;
  ubigeoNacimiento: string;
  ubigeoDomicilio: string;
  correoInstitucional: string;
  correoPersonal: string;
  telefono: string;
  celular: string;

  // UNAMAD metadata
  gradoMaximo: string;
  grupoCarrera: string;
  carreraEgresado: string;
  puestoDetallado: string;
  plazaOrigen: string;
  plazaActual: string;

  // Estado del trabajador (4 valores)
  status: StaffStatus;

  // Datos de cese (solo se usan si status es PASIVO/FALLECIMIENTO; en otros
  // estados el server los limpia).
  fechaCese: string; // YYYY-MM-DD o ""
  motivoCese: StaffCeseMotivo | "";
  documentoCese: string;

  // Initial vínculo (required at creation)
  vinculo: {
    regimenLaboralCode: number;
    vinculoActualCode: number;
    fechaInicio: string;
    fechaTermino: string;
    condicionContrato: StaffCondition | "";
    esAdenda: boolean;
  };
  // Initial workplace (required at creation)
  workplace: {
    otroLocal: boolean;
    localId: string;
    ubigeoLocal: string;
    direccion: string;
  };
};

export type VinculoInput = {
  regimenLaboralCode: number;
  vinculoActualCode: number;
  fechaInicio: string;
  fechaTermino: string;
  condicionContrato: StaffCondition | "";
  esAdenda: boolean;
};

export type WorkplaceInput = {
  otroLocal: boolean;
  localId: string;
  ubigeoLocal: string;
  direccion: string;
};

export type LocalOption = {
  id: string;
  code: string;
  name: string;
};

export type PermFlags = {
  canRead: boolean;
  canWrite: boolean;
  canExport: boolean;
};

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };
