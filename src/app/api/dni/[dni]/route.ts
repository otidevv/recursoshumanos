// GET /api/dni/{dni}
//
// Proxy hacia el servicio de consulta de DNI de UNAMAD
// (apidatos.unamad.edu.pe/api/consulta/{dni}). Se ejecuta server-side para
// evitar CORS en el browser y sanitiza/normaliza la respuesta al subset de
// campos que sí encajan con el modelo SUNEDU.
//
// Requiere permiso staff.write (lo usa el formulario "Nuevo trabajador").

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { ubigeoByCodeStrict } from "@/lib/sunedu";

export const dynamic = "force-dynamic";

const UPSTREAM_BASE = "https://apidatos.unamad.edu.pe/api/consulta";
const TIMEOUT_MS = 5000;

type DniLookup = {
  nombres: string;
  primerApellido: string;
  segundoApellido: string;
  fechaNacimiento: string | null; // YYYY-MM-DD
  sexoCode: 1 | 2 | null;
  ubigeoNacimiento: string | null; // 6 dígitos, solo si existe en catálogo
};

type LookupSuccess = { ok: true; data: DniLookup };
type LookupError = { ok: false; error: string };

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ dni: string }> },
): Promise<NextResponse<LookupSuccess | LookupError>> {
  try {
    await requirePermission("staff.write");
  } catch {
    return NextResponse.json(
      { ok: false, error: "No autorizado." },
      { status: 401 },
    );
  }

  const { dni } = await ctx.params;
  if (!/^\d{8}$/.test(dni)) {
    return NextResponse.json(
      { ok: false, error: "DNI inválido (deben ser 8 dígitos)." },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM_BASE}/${dni}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "TimeoutError";
    return NextResponse.json(
      {
        ok: false,
        error: aborted
          ? "RENIEC no respondió a tiempo."
          : "RENIEC no disponible.",
      },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, error: "DNI no encontrado en RENIEC." },
      { status: 404 },
    );
  }

  let raw: unknown;
  try {
    raw = await upstream.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "RENIEC devolvió una respuesta inválida." },
      { status: 502 },
    );
  }

  if (!raw || typeof raw !== "object") {
    return NextResponse.json(
      { ok: false, error: "DNI no encontrado en RENIEC." },
      { status: 404 },
    );
  }

  const r = raw as Record<string, unknown>;
  const text = (v: unknown): string =>
    typeof v === "string" ? v.trim() : "";

  // Nombres y apellidos son los campos críticos. Si faltan, no es un hit.
  const nombres = text(r.NOMBRES);
  const primerApellido = text(r.AP_PAT);
  if (!nombres || !primerApellido) {
    return NextResponse.json(
      { ok: false, error: "DNI no encontrado en RENIEC." },
      { status: 404 },
    );
  }

  // Fecha viene como "YYYY-MM-DD" — la validamos antes de devolverla.
  const rawFecha = text(r.FECHA_NAC);
  const fechaOk = /^\d{4}-\d{2}-\d{2}$/.test(rawFecha) ? rawFecha : null;

  // SEXO viene como "1" (M) o "2" (F).
  const sexoStr = text(r.SEXO);
  const sexoCode: 1 | 2 | null =
    sexoStr === "1" ? 1 : sexoStr === "2" ? 2 : null;

  // UBIGEO_NAC: solo lo devolvemos si está en nuestro catálogo INEI;
  // RENIEC a veces usa códigos no INEI (Lima provincias antiguas, etc.).
  let ubigeoNacimiento: string | null = null;
  const rawUbi = text(r.UBIGEO_NAC).padStart(6, "0");
  if (/^\d{6}$/.test(rawUbi) && ubigeoByCodeStrict(rawUbi)) {
    ubigeoNacimiento = rawUbi;
  }

  const data: DniLookup = {
    nombres,
    primerApellido,
    segundoApellido: text(r.AP_MAT),
    fechaNacimiento: fechaOk,
    sexoCode,
    ubigeoNacimiento,
  };

  return NextResponse.json({ ok: true, data });
}
