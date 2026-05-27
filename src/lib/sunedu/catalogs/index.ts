// Barrel export for the SUNEDU read-only catalogs.
// Source: 075_PERSONAL_ADMINISTRATIVOS_2026 (SUNEDU SIU template).

export { CARGOS, CARGOS_BY_CODE, type CargoEntry } from "./cargos";
export {
  DEPENDENCIAS,
  DEPENDENCIAS_BY_CODE,
  type DependenciaEntry,
} from "./dependencias";
export {
  TIPOS_DOCUMENTO,
  TIPOS_DOCUMENTO_BY_CODE,
  type TipoDocumentoEntry,
} from "./tipos-documento";
export {
  UN_SOLO_APELLIDO,
  UN_SOLO_APELLIDO_BY_CODE,
  type UnSoloApellidoEntry,
} from "./un-solo-apellido";
export {
  CONDICION_DISCAPACIDAD,
  CONDICION_DISCAPACIDAD_BY_CODE,
  type CondicionDiscapacidadEntry,
} from "./condicion-discapacidad";
export {
  TIPOS_DISCAPACIDAD,
  TIPOS_DISCAPACIDAD_BY_CODE,
  type TipoDiscapacidadEntry,
} from "./tipos-discapacidad";
export { SEXOS, SEXOS_BY_CODE, type SexoEntry } from "./sexos";
export {
  REGIMENES_LABORAL,
  REGIMENES_LABORAL_BY_CODE,
  type RegimenLaboralEntry,
} from "./regimenes-laboral";
export {
  VINCULOS_ACTUAL,
  VINCULOS_ACTUAL_BY_CODE,
  type VinculoActualEntry,
} from "./vinculos-actual";
export {
  OTRO_LOCAL,
  OTRO_LOCAL_BY_CODE,
  type OtroLocalEntry,
} from "./otro-local";

// Code constants used in conditional validation rules.
export const PERU_PAIS_CODE = "9233";
export const DNI_TIPO_DOCUMENTO_CODE = 1;
