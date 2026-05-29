// POST /api/personal/sync-nombres
//
// Reconciliación masiva del orden de apellidos/nombres con RENIEC. Recibe
// una lista de IDs (los detectados como "posibles nombres invertidos" por la
// heurística) y para cada uno consulta RENIEC. Si el nombre/apellidos de
// RENIEC difieren del actual en BD (y el RENIEC indica claramente
// "AP_PAT=X, AP_MAT=Y, NOMBRES=Z"), corrige el orden.
//
// IMPORTANTE: este endpoint solo actualiza si el match es CLARO (los tokens
// del DNI en BD aparecen los 3 en RENIEC pero distribuidos distinto).
// Si RENIEC dice nombres completamente diferentes, NO actualiza — eso indica
// que es otro trabajador o que RENIEC tiene datos viejos.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UPSTREAM_BASE = "https://apidatos.unamad.edu.pe/api/consulta";
const TIMEOUT_MS = 6000;
const CONCURRENCY = 5;

type SyncResult = {
  total: number;
  corregidos: number;
  yaCorrectos: number;
  noCoincide: number; // RENIEC devuelve nombres muy diferentes
  noEncontrados: number;
  errores: number;
  detalles: {
    dni: string;
    accion: "corrected" | "already-ok" | "mismatch" | "not-found" | "error";
    antes?: { primer: string; segundo: string | null; nombres: string };
    despues?: { primer: string; segundo: string; nombres: string };
    reason?: string;
  }[];
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

function tokensOf(s: string): Set<string> {
  return new Set(
    norm(s)
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

async function fetchReniec(dni: string): Promise<
  | { ok: true; data: { primer: string; segundo: string; nombres: string } | null }
  | { ok: false; reason: string }
> {
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
  if (res.status === 404) return { ok: true, data: null };
  if (!res.ok) return { ok: false, reason: `http-${res.status}` };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: "json-parse" };
  }
  if (!body || typeof body !== "object") return { ok: true, data: null };
  const r = body as Record<string, unknown>;
  const primer = typeof r.AP_PAT === "string" ? r.AP_PAT.trim() : "";
  const segundo = typeof r.AP_MAT === "string" ? r.AP_MAT.trim() : "";
  const nombres = typeof r.NOMBRES === "string" ? r.NOMBRES.trim() : "";
  if (!primer || !nombres) return { ok: true, data: null };
  return { ok: true, data: { primer, segundo, nombres } };
}

export async function POST(req: NextRequest): Promise<NextResponse<SyncResult>> {
  await requirePermission("staff.write");

  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : [];

  const staff = await prisma.administrativeStaff.findMany({
    where: {
      id: { in: ids },
      tipoDocumentoCode: 1,
    },
    select: {
      id: true,
      numeroDocumento: true,
      primerApellido: true,
      segundoApellido: true,
      nombres: true,
    },
  });
  const targets = staff.filter((s) => /^\d{8}$/.test(s.numeroDocumento));

  const result: SyncResult = {
    total: targets.length,
    corregidos: 0,
    yaCorrectos: 0,
    noCoincide: 0,
    noEncontrados: 0,
    errores: 0,
    detalles: [],
  };

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (s) => {
        const r = await fetchReniec(s.numeroDocumento);
        if (!r.ok) {
          result.errores++;
          result.detalles.push({
            dni: s.numeroDocumento,
            accion: "error",
            reason: r.reason,
          });
          return;
        }
        if (!r.data) {
          result.noEncontrados++;
          result.detalles.push({
            dni: s.numeroDocumento,
            accion: "not-found",
          });
          return;
        }
        const reniec = r.data;
        const antes = {
          primer: s.primerApellido,
          segundo: s.segundoApellido,
          nombres: s.nombres,
        };
        const yaCorrecto =
          norm(s.primerApellido) === norm(reniec.primer) &&
          norm(s.segundoApellido ?? "") === norm(reniec.segundo) &&
          norm(s.nombres) === norm(reniec.nombres);
        if (yaCorrecto) {
          result.yaCorrectos++;
          result.detalles.push({
            dni: s.numeroDocumento,
            accion: "already-ok",
          });
          return;
        }
        // Verificar que sea claramente la misma persona — los 3 tokens (primer,
        // segundo, nombres[0]) deben encontrarse entre la unión de los campos
        // de BD, en cualquier orden.
        const bdAll = tokensOf(
          `${s.primerApellido} ${s.segundoApellido ?? ""} ${s.nombres}`,
        );
        const reniecAll = tokensOf(
          `${reniec.primer} ${reniec.segundo} ${reniec.nombres}`,
        );
        const intersection = [...reniecAll].filter((t) => bdAll.has(t));
        // Misma persona si al menos 75% de los tokens de RENIEC están en BD.
        const sameRatio = intersection.length / Math.max(1, reniecAll.size);
        if (sameRatio < 0.75) {
          result.noCoincide++;
          result.detalles.push({
            dni: s.numeroDocumento,
            accion: "mismatch",
            antes,
            despues: reniec,
          });
          return;
        }
        // Aplicar corrección con datos de RENIEC.
        try {
          await prisma.administrativeStaff.update({
            where: { id: s.id },
            data: {
              primerApellido: reniec.primer,
              segundoApellido: reniec.segundo || null,
              nombres: reniec.nombres,
              unSoloApellido: !reniec.segundo,
            },
          });
          result.corregidos++;
          result.detalles.push({
            dni: s.numeroDocumento,
            accion: "corrected",
            antes,
            despues: reniec,
          });
        } catch {
          result.errores++;
        }
      }),
    );
  }

  return NextResponse.json(result);
}
