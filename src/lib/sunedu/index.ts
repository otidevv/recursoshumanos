// Public surface for the SUNEDU catalog data.
//
// The small enumerations (CARGO, SEXO, etc.) are TypeScript const arrays —
// import them directly via `@/lib/sunedu/catalogs`.
// The large catalogs (PAÍS ~191, UBIGEO ~1905) are JSON; use the helpers
// below so that the type stays narrow at call sites.

import paisesJson from "./paises.json";
import ubigeosJson from "./ubigeos.json";

export type PaisEntry = { code: string; label: string };
export type UbigeoEntry = {
  code: string;
  departamento: string;
  provincia: string;
  distrito: string;
};

export const PAISES: readonly PaisEntry[] = paisesJson as PaisEntry[];
export const UBIGEOS: readonly UbigeoEntry[] = ubigeosJson as UbigeoEntry[];

const paisByCode = new Map(PAISES.map((p) => [p.code, p.label]));
const ubigeoByCode = new Map(UBIGEOS.map((u) => [u.code, u]));

export function paisLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return paisByCode.get(code) ?? null;
}

export function ubigeoByCodeStrict(code: string): UbigeoEntry | null {
  return ubigeoByCode.get(code) ?? null;
}

export function ubigeoLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const u = ubigeoByCode.get(code);
  return u ? `${u.departamento} / ${u.provincia} / ${u.distrito}` : null;
}

export * from "./catalogs";
