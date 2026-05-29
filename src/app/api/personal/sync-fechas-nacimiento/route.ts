// POST /api/personal/sync-fechas-nacimiento
//
// Reconciliación masiva de fecha de nacimiento con RENIEC. Recorre todos los
// trabajadores con DNI 8 dígitos cuya fechaNacimiento es ficticia (año < 1940,
// típicamente 1900-01-01 placeholder de la migración) y consulta el endpoint
// UNAMAD/RENIEC para obtener la fecha real.
//
// Idempotente: solo actualiza si RENIEC devuelve fecha; sino no toca el campo.
// Re-ejecutarlo no daña los que ya tienen fecha real.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UPSTREAM_BASE = "https://apidatos.unamad.edu.pe/api/consulta";
const TIMEOUT_MS = 6000;
const CONCURRENCY = 5;
const PLACEHOLDER_LIMIT = new Date(Date.UTC(1940, 0, 1));

type SyncResult = {
  total: number;
  actualizados: number;
  noEncontrados: number;
  errores: number;
  errorDetails: { dni: string; reason: string }[];
};

function utcDateOnly(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

async function fetchFechaNac(
  dni: string,
): Promise<{ ok: true; fecha: Date | null } | { ok: false; reason: string }> {
  let res: Response;
  try {
    res = await fetch(`${UPSTREAM_BASE}/${dni}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "TimeoutError";
    return { ok: false, reason: aborted ? "timeout" : "network" };
  }
  if (res.status === 404) return { ok: true, fecha: null };
  if (!res.ok) return { ok: false, reason: `http-${res.status}` };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: "json-parse" };
  }
  if (!body || typeof body !== "object") return { ok: true, fecha: null };
  const r = body as Record<string, unknown>;
  const rawFecha = typeof r.FECHA_NAC === "string" ? r.FECHA_NAC.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawFecha);
  if (!m) return { ok: true, fecha: null };
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > new Date().getUTCFullYear()) return { ok: true, fecha: null };
  return { ok: true, fecha: utcDateOnly(y, mo, d) };
}

export async function POST(): Promise<
  NextResponse<SyncResult | { error: string }>
> {
  await requirePermission("staff.write");

  const all = await prisma.administrativeStaff.findMany({
    where: {
      tipoDocumentoCode: 1,
      fechaNacimiento: { lt: PLACEHOLDER_LIMIT },
    },
    select: { id: true, numeroDocumento: true },
  });
  const targets = all.filter((s) => /^\d{8}$/.test(s.numeroDocumento));

  const result: SyncResult = {
    total: targets.length,
    actualizados: 0,
    noEncontrados: 0,
    errores: 0,
    errorDetails: [],
  };

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (s) => {
        const r = await fetchFechaNac(s.numeroDocumento);
        if (!r.ok) {
          result.errores++;
          if (result.errorDetails.length < 20) {
            result.errorDetails.push({
              dni: s.numeroDocumento,
              reason: r.reason,
            });
          }
          return;
        }
        if (r.fecha == null) {
          result.noEncontrados++;
          return;
        }
        try {
          await prisma.administrativeStaff.update({
            where: { id: s.id },
            data: { fechaNacimiento: r.fecha },
          });
          result.actualizados++;
        } catch {
          result.errores++;
        }
      }),
    );
  }

  return NextResponse.json(result);
}
