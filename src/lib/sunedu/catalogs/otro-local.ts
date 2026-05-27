// AUTO-GENERATED from 075_PERSONAL_ADMINISTRATIVOS_2026 (SUNEDU SIU template).
// Do not edit by hand.

export type OtroLocalEntry = { code: number; label: string };

export const OTRO_LOCAL = [
  { code: 1, label: "Sí" },
  { code: 0, label: "No" },
] as const satisfies readonly OtroLocalEntry[];

export const OTRO_LOCAL_BY_CODE: ReadonlyMap<number, string> = new Map(
  OTRO_LOCAL.map((e) => [e.code, e.label]),
);
