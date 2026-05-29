// GET /api/personal/search?q=<query>
//
// Búsqueda transversal de personal por nombre, DNI, cargo y dependencia.
// Devuelve hasta 12 resultados ordenados por relevancia (DNI exacto primero,
// luego matches por nombre).
//
// Usado por el componente <GlobalSearch /> en el TopBar.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/server";
import {
  CARGOS_BY_CODE,
  DEPENDENCIAS_BY_CODE,
} from "@/lib/sunedu/catalogs";

export const dynamic = "force-dynamic";

type SearchHit = {
  id: string;
  dni: string;
  nombreCompleto: string;
  cargo: string;
  dependencia: string;
  status: string;
};

export async function GET(req: NextRequest) {
  try {
    await requirePermission("staff.read");
  } catch {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ ok: true, hits: [] });
  }

  // Si es solo dígitos, prioriza match exacto por DNI.
  const isNumeric = /^\d+$/.test(q);
  const tokens = q
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  // Estrategia: hacemos un OR amplio en Prisma y luego filtramos accent-
  // insensitive en memoria sobre los resultados.
  const candidates = await prisma.administrativeStaff.findMany({
    where: {
      OR: [
        ...(isNumeric ? [{ numeroDocumento: { startsWith: q } }] : []),
        ...tokens.map((t) => ({
          OR: [
            { nombres: { contains: t, mode: "insensitive" as const } },
            { primerApellido: { contains: t, mode: "insensitive" as const } },
            { segundoApellido: { contains: t, mode: "insensitive" as const } },
          ],
        })),
      ],
    },
    select: {
      id: true,
      numeroDocumento: true,
      nombres: true,
      primerApellido: true,
      segundoApellido: true,
      cargoCode: true,
      dependenciaCode: true,
      status: true,
    },
    take: 30,
  });

  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const qNorm = norm(q);
  const tokenNorms = tokens.map(norm);

  function scoreAndFilter(
    s: (typeof candidates)[number],
  ): { score: number; hit: SearchHit } | null {
    const apellidos = [s.primerApellido, s.segundoApellido]
      .filter(Boolean)
      .join(" ")
      .trim();
    const nombreCompleto = `${apellidos}, ${s.nombres}`.trim();
    const hay = norm(`${nombreCompleto} ${s.numeroDocumento}`);

    // Token AND-match
    if (tokenNorms.length > 0 && !tokenNorms.every((t) => hay.includes(t)))
      return null;

    let score = 0;
    if (isNumeric && s.numeroDocumento === q) score += 1000; // DNI exacto
    else if (isNumeric && s.numeroDocumento.startsWith(q)) score += 500;
    if (norm(s.primerApellido).startsWith(qNorm)) score += 100;
    if (norm(s.nombres).startsWith(qNorm)) score += 80;
    if (hay.startsWith(qNorm)) score += 50;
    // Boost vigentes
    if (s.status === "ACTIVO") score += 10;

    return {
      score,
      hit: {
        id: s.id,
        dni: s.numeroDocumento,
        nombreCompleto,
        cargo: CARGOS_BY_CODE.get(s.cargoCode) ?? `Cargo ${s.cargoCode}`,
        dependencia:
          DEPENDENCIAS_BY_CODE.get(s.dependenciaCode) ?? `Dep. ${s.dependenciaCode}`,
        status: s.status,
      },
    };
  }

  const ranked = candidates
    .map(scoreAndFilter)
    .filter((x): x is { score: number; hit: SearchHit } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => x.hit);

  return NextResponse.json({ ok: true, hits: ranked });
}
