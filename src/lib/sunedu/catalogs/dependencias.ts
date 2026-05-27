// AUTO-GENERATED from 075_PERSONAL_ADMINISTRATIVOS_2026 (SUNEDU SIU template).
// Do not edit by hand.

export type DependenciaEntry = { code: number; label: string };

export const DEPENDENCIAS = [
  { code: 1, label: "Investigación" },
  { code: 2, label: "Bienestar y empleabilidad" },
  { code: 3, label: "Unidad de Posgrado/Facultad" },
  { code: 4, label: "Biblioteca" },
  { code: 5, label: "Responsabilidad Social/Áreas Culturales" },
  { code: 6, label: "Centro Pre/Centro de Idiomas/Formación continua" },
  { code: 7, label: "Admisión" },
  { code: 8, label: "Centros de Producción" },
  { code: 9, label: "Rectorado/Áreas de apoyo/Áreas de asesoramiento" },
  { code: 10, label: "Áreas de Servicios Generales" },
] as const satisfies readonly DependenciaEntry[];

export const DEPENDENCIAS_BY_CODE: ReadonlyMap<number, string> = new Map(
  DEPENDENCIAS.map((e) => [e.code, e.label]),
);
