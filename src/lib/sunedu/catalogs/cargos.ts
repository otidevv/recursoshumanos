// AUTO-GENERATED from 075_PERSONAL_ADMINISTRATIVOS_2026 (SUNEDU SIU template).
// Do not edit by hand.

export type CargoEntry = { code: number; label: string };

export const CARGOS = [
  { code: 1, label: "Profesionales científicos e intelectuales" },
  { code: 2, label: "Profesionales técnicos" },
  { code: 3, label: "Administrativos" },
  { code: 4, label: "Ocupaciones elementales, conductores de transporte u otros" },
] as const satisfies readonly CargoEntry[];

export const CARGOS_BY_CODE: ReadonlyMap<number, string> = new Map(
  CARGOS.map((e) => [e.code, e.label]),
);
