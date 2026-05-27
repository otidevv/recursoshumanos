import { NextResponse } from "next/server";

export type ApiError = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string>;
};

export function ok<T extends object>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...data }, { status });
}

export function fail(
  error: string,
  status = 400,
  fieldErrors?: Record<string, string>,
): NextResponse {
  const body: ApiError = { ok: false, error };
  if (fieldErrors) body.fieldErrors = fieldErrors;
  return NextResponse.json(body, { status });
}

export const ERR_UNAUTHENTICATED = "No autenticado.";
export const ERR_FORBIDDEN = "No tienes permiso para esta acción.";
export const ERR_NOT_FOUND = "Recurso no encontrado.";
export const ERR_BAD_REQUEST = "Solicitud inválida.";
