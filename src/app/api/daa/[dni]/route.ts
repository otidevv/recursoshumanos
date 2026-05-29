// GET /api/daa/{dni}
//
// Proxy hacia el servicio DAA (Dirección de Asuntos Académicos) de UNAMAD
// que devuelve datos de estudiantes/egresados por DNI:
//   https://daa-documentos.unamad.edu.pe:8081/api/data/student/{DNI}
//
// Requiere Bearer token (DAA_BEARER_TOKEN en .env). Se ejecuta server-side
// para no exponer el token al browser y para sanitizar la respuesta.
//
// Solo devuelve un hit si el DNI pertenece a un estudiante/egresado de
// UNAMAD. Personal externo (no formado en UNAMAD) responde 404 y el form
// pide los datos de carrera/facultad manualmente.

import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const UPSTREAM_BASE =
  "https://daa-documentos.unamad.edu.pe:8081/api/data/student";
const TIMEOUT_MS = 6000;

type DaaLookup = {
  // Campos directamente útiles para el form de personal.
  carrera: string; // "INGENIERÍA DE SISTEMAS E INFORMÁTICA"
  facultad: string; // "INGENIERIA"
  nombres: string;
  primerApellido: string;
  segundoApellido: string;
  emailInstitucional: string | null;
  emailPersonal: string | null;
  creditosAprobados: number | null;
};

type LookupSuccess = { ok: true; data: DaaLookup };
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

  const token = process.env.DAA_BEARER_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: "DAA no configurado (falta DAA_BEARER_TOKEN en .env).",
      },
      { status: 503 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${UPSTREAM_BASE}/${dni}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "TimeoutError";
    return NextResponse.json(
      {
        ok: false,
        error: aborted ? "DAA no respondió a tiempo." : "DAA no disponible.",
      },
      { status: 502 },
    );
  }

  if (upstream.status === 401 || upstream.status === 403) {
    return NextResponse.json(
      {
        ok: false,
        error: "Token DAA inválido o expirado (revisa DAA_BEARER_TOKEN).",
      },
      { status: 502 },
    );
  }
  if (upstream.status === 404) {
    return NextResponse.json(
      { ok: false, error: "DNI no encontrado en DAA (no es egresado UNAMAD)." },
      { status: 404 },
    );
  }
  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, error: `DAA respondió ${upstream.status}.` },
      { status: 502 },
    );
  }

  let raw: unknown;
  try {
    raw = await upstream.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "DAA devolvió una respuesta inválida." },
      { status: 502 },
    );
  }

  // Schema esperado:
  // { status: "success", data: [{ info: {...}, totalCreditsApproved: 215 }], message }
  if (!raw || typeof raw !== "object") {
    return NextResponse.json(
      { ok: false, error: "DNI no encontrado en DAA." },
      { status: 404 },
    );
  }
  const r = raw as Record<string, unknown>;
  if (r.status !== "success" || !Array.isArray(r.data) || r.data.length === 0) {
    return NextResponse.json(
      { ok: false, error: "DNI no encontrado en DAA." },
      { status: 404 },
    );
  }

  // Si hay múltiples filas (alumno que cambió carrera), tomamos la primera —
  // DAA las devuelve ordenadas por último periodo descendente.
  const first = r.data[0] as Record<string, unknown>;
  const info = (first.info ?? {}) as Record<string, unknown>;
  const credits = first.totalCreditsApproved;

  const text = (v: unknown): string =>
    typeof v === "string" ? v.trim() : "";
  const textOrNull = (v: unknown): string | null => {
    const s = text(v);
    return s.length > 0 ? s : null;
  };

  const carrera = text(info.carrerName); // sic: campo se llama "carrerName"
  const facultad = text(info.facultyName);

  if (!carrera) {
    // Sin carrera, el hit no es útil para nuestro caso.
    return NextResponse.json(
      { ok: false, error: "DAA no devolvió carrera para ese DNI." },
      { status: 404 },
    );
  }

  const data: DaaLookup = {
    carrera,
    facultad,
    nombres: text(info.name),
    primerApellido: text(info.paternalSurname),
    segundoApellido: text(info.maternalSurname),
    emailInstitucional: textOrNull(info.email),
    emailPersonal: textOrNull(info.personalEmail),
    creditosAprobados: typeof credits === "number" ? credits : null,
  };

  return NextResponse.json({ ok: true, data });
}
