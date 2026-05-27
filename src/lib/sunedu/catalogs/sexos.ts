// AUTO-GENERATED from 075_PERSONAL_ADMINISTRATIVOS_2026 (SUNEDU SIU template).
// Do not edit by hand.

export type SexoEntry = { code: number; label: string };

export const SEXOS = [
  { code: 1, label: "Masculino" },
  { code: 2, label: "Femenino" },
] as const satisfies readonly SexoEntry[];

export const SEXOS_BY_CODE: ReadonlyMap<number, string> = new Map(
  SEXOS.map((e) => [e.code, e.label]),
);
