// AUTO-GENERATED from 075_PERSONAL_ADMINISTRATIVOS_2026 (SUNEDU SIU template).
// Do not edit by hand.

export type UnSoloApellidoEntry = { code: number; label: string };

export const UN_SOLO_APELLIDO = [
  { code: 1, label: "Sí" },
  { code: 0, label: "No" },
] as const satisfies readonly UnSoloApellidoEntry[];

export const UN_SOLO_APELLIDO_BY_CODE: ReadonlyMap<number, string> = new Map(
  UN_SOLO_APELLIDO.map((e) => [e.code, e.label]),
);
