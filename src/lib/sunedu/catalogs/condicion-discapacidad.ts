// AUTO-GENERATED from 075_PERSONAL_ADMINISTRATIVOS_2026 (SUNEDU SIU template).
// Do not edit by hand.

export type CondicionDiscapacidadEntry = { code: number; label: string };

export const CONDICION_DISCAPACIDAD = [
  { code: 1, label: "Sí" },
  { code: 0, label: "No" },
] as const satisfies readonly CondicionDiscapacidadEntry[];

export const CONDICION_DISCAPACIDAD_BY_CODE: ReadonlyMap<number, string> = new Map(
  CONDICION_DISCAPACIDAD.map((e) => [e.code, e.label]),
);
