// AUTO-GENERATED from 075_PERSONAL_ADMINISTRATIVOS_2026 (SUNEDU SIU template).
// Do not edit by hand.

export type RegimenLaboralEntry = { code: number; label: string };

export const REGIMENES_LABORAL = [
  { code: 3, label: "CAP (Decreto Legislativo 276)" },
  { code: 4, label: "CAS (Decreto Legislativo 1057)" },
  { code: 5, label: "Orden de Servicio" },
  { code: 8, label: "Servicio Civil (Ley 30057)" },
] as const satisfies readonly RegimenLaboralEntry[];

export const REGIMENES_LABORAL_BY_CODE: ReadonlyMap<number, string> = new Map(
  REGIMENES_LABORAL.map((e) => [e.code, e.label]),
);
