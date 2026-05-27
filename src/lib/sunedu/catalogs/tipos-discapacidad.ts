// AUTO-GENERATED from 075_PERSONAL_ADMINISTRATIVOS_2026 (SUNEDU SIU template).
// Do not edit by hand.

export type TipoDiscapacidadEntry = { code: number; label: string };

export const TIPOS_DISCAPACIDAD = [
  { code: 1, label: "Discapacidad Motriz" },
  { code: 2, label: "Discapacidad Visual" },
  { code: 3, label: "Visual y Esquema Corporal" },
  { code: 4, label: "Disminuidos Visuales" },
  { code: 5, label: "Discapacidad Auditiva" },
  { code: 6, label: "Autismo" },
  { code: 7, label: "Discapacidad Mental" },
  { code: 8, label: "Parálisis Cerebral" },
  { code: 9, label: "Discapacidad Intelectual" },
  { code: 10, label: "Sordoceguera" },
  { code: 11, label: "No Cuenta con Información" },
  { code: 12, label: "Otros" },
  { code: 13, label: "Sindrome de Asperger" },
  { code: 14, label: "Hemiplejia no Identificada" },
  { code: 15, label: "Estenosis Congénita de la Válvula Aortica" },
  { code: 16, label: "Multidiscapacidad" },
  { code: 17, label: "Discapacidad Fisica" },
  { code: 18, label: "Transtorno del Espectro Autista" },
  { code: 19, label: "T. por Déficit de Atención con Hiperactividad" },
  { code: 20, label: "T. Especifico del Aprendizaje" },
  { code: 21, label: "T. Mentales y del Comportamiento" },
  { code: 22, label: "Enfermedades Raras" },
  { code: 23, label: "Talla Baja" },
  { code: 24, label: "Talento" },
  { code: 25, label: "Superdotación" },
] as const satisfies readonly TipoDiscapacidadEntry[];

export const TIPOS_DISCAPACIDAD_BY_CODE: ReadonlyMap<number, string> = new Map(
  TIPOS_DISCAPACIDAD.map((e) => [e.code, e.label]),
);
