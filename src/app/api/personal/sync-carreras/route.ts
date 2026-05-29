// POST /api/personal/sync-carreras
//
// Reconciliación masiva con la API DAA: recorre todos los trabajadores con
// carreraEgresado vacía + DNI válido, consulta DAA por DNI y persiste la
// carrera devuelta. Idempotente: re-ejecutarlo no daña trabajadores que ya
// tienen carrera (solo toca los vacíos).
//
// Diseño:
//   - Concurrencia 5 simultáneas (no saturar DAA, que es IIS Microsoft).
//   - Timeout 8s por request DAA.
//   - Errores individuales no bloquean al lote: se cuentan y siguen.
//   - Devuelve resumen: { total, encontrados, noEncontrados, errores, errorDetails }.
//
// Para uso desde el módulo de reportes (botón "Sincronizar carreras con DAA").

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — DAA puede ser lenta para 100+ DNIs

const UPSTREAM_BASE =
  "https://daa-documentos.unamad.edu.pe:8081/api/data/student";
const TIMEOUT_MS = 8000;
const CONCURRENCY = 5;

type SyncResult = {
  total: number;
  encontrados: number;
  noEncontrados: number;
  errores: number;
  errorDetails: { dni: string; reason: string }[];
};

async function fetchCarrera(
  dni: string,
  token: string,
): Promise<{ ok: true; carrera: string | null } | { ok: false; reason: string }> {
  let res: Response;
  try {
    res = await fetch(`${UPSTREAM_BASE}/${dni}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "TimeoutError";
    return { ok: false, reason: aborted ? "timeout" : "network" };
  }
  if (res.status === 404) return { ok: true, carrera: null };
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "token-invalid" };
  }
  if (!res.ok) return { ok: false, reason: `http-${res.status}` };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: "json-parse" };
  }
  if (!body || typeof body !== "object") return { ok: true, carrera: null };
  const b = body as Record<string, unknown>;
  if (b.status !== "success" || !Array.isArray(b.data) || b.data.length === 0) {
    return { ok: true, carrera: null };
  }
  const first = b.data[0] as Record<string, unknown>;
  const info = (first.info ?? {}) as Record<string, unknown>;
  const carrera = info.carrerName;
  if (typeof carrera !== "string" || !carrera.trim()) {
    return { ok: true, carrera: null };
  }
  return { ok: true, carrera: carrera.trim() };
}

export async function POST(): Promise<NextResponse<SyncResult | { error: string }>> {
  await requirePermission("staff.write");

  const token = process.env.DAA_BEARER_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "DAA_BEARER_TOKEN no configurado en .env." },
      { status: 503 },
    );
  }

  // Trabajadores con carrera vacía y DNI peruano de 8 dígitos.
  const allEmpty = await prisma.administrativeStaff.findMany({
    where: {
      tipoDocumentoCode: 1,
      OR: [{ carreraEgresado: null }, { carreraEgresado: "" }],
    },
    select: { id: true, numeroDocumento: true },
  });

  // Filtro adicional cliente-side: solo los que tengan DNI 8 dígitos.
  const targets = allEmpty.filter((s) => /^\d{8}$/.test(s.numeroDocumento));

  const result: SyncResult = {
    total: targets.length,
    encontrados: 0,
    noEncontrados: 0,
    errores: 0,
    errorDetails: [],
  };

  // Procesar en lotes de CONCURRENCY. Mantengo control simple sin librerías.
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (s) => {
        const r = await fetchCarrera(s.numeroDocumento, token);
        if (!r.ok) {
          result.errores++;
          if (result.errorDetails.length < 20) {
            // Limito el detalle a 20 errores para no inflar el payload de
            // respuesta. La UI muestra resumen + primeros 20.
            result.errorDetails.push({
              dni: s.numeroDocumento,
              reason: r.reason,
            });
          }
          return;
        }
        if (r.carrera == null) {
          result.noEncontrados++;
          return;
        }
        try {
          await prisma.administrativeStaff.update({
            where: { id: s.id },
            data: { carreraEgresado: r.carrera },
          });
          result.encontrados++;
        } catch {
          result.errores++;
          if (result.errorDetails.length < 20) {
            result.errorDetails.push({
              dni: s.numeroDocumento,
              reason: "db-update",
            });
          }
        }
      }),
    );
  }

  return NextResponse.json(result);
}
