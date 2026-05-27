// AUTO-GENERATED from 075_PERSONAL_ADMINISTRATIVOS_2026 (SUNEDU SIU template).
// Do not edit by hand.

export type TipoDocumentoEntry = { code: number; label: string };

export const TIPOS_DOCUMENTO = [
  { code: 1, label: "Documento Nacional de Identidad" },
  { code: 2, label: "Pasaporte" },
  { code: 3, label: "Carné de Extranjería" },
  { code: 4, label: "Cédula de identidad" },
  { code: 5, label: "Documento Extranjero - Otros" },
  { code: 6, label: "Permiso Temporal de Permanencia" },
  { code: 7, label: "Carné de Identidad" },
  { code: 8, label: "Cédula de Ciudadanía" },
  { code: 9, label: "Carné Temporal de Permanencia" },
] as const satisfies readonly TipoDocumentoEntry[];

export const TIPOS_DOCUMENTO_BY_CODE: ReadonlyMap<number, string> = new Map(
  TIPOS_DOCUMENTO.map((e) => [e.code, e.label]),
);
