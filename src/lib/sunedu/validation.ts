// Server-side validators that mirror the AYUDA sheet rules of the SUNEDU
// "Carga Masiva General" template. Keep these pure (no DB calls) so they
// can be used both inside server actions and inside the xlsx exporter.

import { ubigeoByCodeStrict, paisLabel } from ".";
import { PERU_PAIS_CODE, DNI_TIPO_DOCUMENTO_CODE } from "./catalogs";
import { TIPOS_DOCUMENTO_BY_CODE } from "./catalogs/tipos-documento";

/**
 * Documento length constraints per TIPO_DOCUMENTO (per AYUDA sheet).
 *   1 DNI:                 exactly 8
 *   2 Pasaporte:           7-18
 *   3 Carné Extranjería:   7-18
 *   4 Cédula Identidad:    7-15
 *   5 Doc Extranjero otros: ≤18
 *   6 PTP:                 exactly 9
 *   7 Carné Identidad:     ≤18
 *   8 Cédula Ciudadanía:   ≤18 (asumido)
 *   9 Carné Temporal Perm: ≤18 (asumido)
 */
const DOC_RULES: Record<number, { min: number; max: number; numeric?: boolean }> = {
  1: { min: 8, max: 8, numeric: true },
  2: { min: 7, max: 18 },
  3: { min: 7, max: 18 },
  4: { min: 7, max: 15 },
  5: { min: 1, max: 18 },
  6: { min: 9, max: 9 },
  7: { min: 1, max: 18 },
  8: { min: 1, max: 18 },
  9: { min: 1, max: 18 },
};

export function validateNumeroDocumento(
  tipoCode: number,
  numero: string,
): string | null {
  const tipoLabel = TIPOS_DOCUMENTO_BY_CODE.get(tipoCode);
  if (!tipoLabel) return "Tipo de documento inválido.";

  const trimmed = numero.trim();
  if (!trimmed) return "Número de documento requerido.";

  const rule = DOC_RULES[tipoCode];
  if (!rule) return "Tipo de documento no soportado.";

  if (rule.numeric && !/^\d+$/.test(trimmed)) {
    return `${tipoLabel}: solo dígitos.`;
  }
  if (trimmed.length < rule.min || trimmed.length > rule.max) {
    if (rule.min === rule.max) {
      return `${tipoLabel}: debe tener exactamente ${rule.min} caracteres.`;
    }
    return `${tipoLabel}: longitud entre ${rule.min} y ${rule.max}.`;
  }
  if (!rule.numeric && !/^[A-Za-z0-9-]+$/.test(trimmed)) {
    return `${tipoLabel}: solo letras, números o guiones.`;
  }
  return null;
}

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function validateEmail(value: string): string | null {
  if (!value) return null;
  if (!EMAIL_RE.test(value)) return "Formato de correo inválido.";
  if (value.length > 120) return "Correo demasiado largo.";
  return null;
}

export function validateUbigeo(code: string | null | undefined): string | null {
  if (!code) return "Ubigeo requerido.";
  if (!/^\d{6}$/.test(code)) return "Ubigeo debe ser 6 dígitos.";
  if (!ubigeoByCodeStrict(code)) return "Ubigeo no encontrado en catálogo.";
  return null;
}

export function validatePais(code: string | null | undefined): string | null {
  if (!code) return "País requerido.";
  if (!paisLabel(code)) return "País no encontrado en catálogo.";
  return null;
}

/**
 * Conditional rules applied at the staff-record level (after individual field
 * validation has passed). Returns a record of `{ field: message }`.
 */
export function validateStaffConditionals(input: {
  unSoloApellido: boolean;
  segundoApellido: string | null;
  condicionDiscapacidad: boolean;
  tipoDiscapacidadCode: number | null;
  paisNacimientoCode: string;
  ubigeoNacimiento: string | null;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.unSoloApellido && !(input.segundoApellido ?? "").trim()) {
    errors.segundoApellido =
      'Si tiene dos apellidos, este campo es obligatorio. Active "un solo apellido" en caso contrario.';
  }
  if (input.condicionDiscapacidad && !input.tipoDiscapacidadCode) {
    errors.tipoDiscapacidadCode =
      "Requerido cuando hay condición de discapacidad.";
  }
  if (
    input.paisNacimientoCode === PERU_PAIS_CODE &&
    !(input.ubigeoNacimiento ?? "").trim()
  ) {
    errors.ubigeoNacimiento = "Requerido cuando el país de nacimiento es Perú.";
  }
  return errors;
}

export { PERU_PAIS_CODE, DNI_TIPO_DOCUMENTO_CODE };
