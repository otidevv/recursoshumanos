// AUTO-GENERATED from 075_PERSONAL_ADMINISTRATIVOS_2026 (SUNEDU SIU template).
// Do not edit by hand.

export type VinculoActualEntry = { code: number; label: string };

export const VINCULOS_ACTUAL = [
  { code: 1, label: "Sí" },
  { code: 2, label: "No" },
] as const satisfies readonly VinculoActualEntry[];

export const VINCULOS_ACTUAL_BY_CODE: ReadonlyMap<number, string> = new Map(
  VINCULOS_ACTUAL.map((e) => [e.code, e.label]),
);
