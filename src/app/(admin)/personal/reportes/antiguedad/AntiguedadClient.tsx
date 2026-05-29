"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, TrendingUp } from "lucide-react";

export type AntRow = {
  id: string;
  nombre: string;
  dni: string;
  oficina: string;
  cargo: string;
  condicionVigente: string | null;
  fechaIngresoIE: string;
  anios: number;
  mesesExtra: number;
};

const RANGES = [
  { key: "todos", label: "Todos", test: () => true },
  { key: "lt5", label: "< 5 años", test: (a: number) => a < 5 },
  { key: "5-10", label: "5–10 años", test: (a: number) => a >= 5 && a < 10 },
  { key: "10-20", label: "10–20 años", test: (a: number) => a >= 10 && a < 20 },
  { key: "gte20", label: "≥ 20 años", test: (a: number) => a >= 20 },
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function AntiguedadClient({ rows }: { rows: AntRow[] }) {
  const [query, setQuery] = useState("");
  const [rangeKey, setRangeKey] = useState<string>("todos");

  const filtered = useMemo(() => {
    let out = rows;
    const range = RANGES.find((r) => r.key === rangeKey);
    if (range) out = out.filter((r) => range.test(r.anios));
    if (query.trim()) {
      const tokens = norm(query).split(/\s+/).filter(Boolean);
      out = out.filter((r) => {
        const hay = norm(`${r.nombre} ${r.dni} ${r.cargo} ${r.oficina}`);
        return tokens.every((t) => hay.includes(t));
      });
    }
    return out;
  }, [rows, query, rangeKey]);

  // Stats por rango
  const stats = useMemo(() => {
    return RANGES.map((r) => ({
      key: r.key,
      label: r.label,
      count: rows.filter((x) => r.test(x.anios)).length,
    }));
  }, [rows]);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 20, fontSize: 13 }}>
        <Link
          href="/personal/reportes"
          style={{
            color: "var(--accent-strong)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <ArrowLeft size={14} /> Volver a Reportes
        </Link>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: "var(--text)",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <TrendingUp size={24} /> Antigüedad del personal
          </h1>
          <p
            style={{
              color: "var(--text-faint)",
              fontSize: 14,
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            Personal vigente ordenado por años de servicio. Excluye fechas de
            ingreso placeholder.
          </p>
        </div>
        <a
          href="/api/personal/reportes/antiguedad"
          download
          style={primaryBtn(rows.length === 0)}
        >
          <Download size={14} /> Descargar xlsx completo
        </a>
      </div>

      {/* Rangos como chips con stats */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
        }}
      >
        {stats.map((s) => {
          const active = rangeKey === s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setRangeKey(s.key)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                background: active ? "var(--accent-soft)" : "var(--surface)",
                border: active
                  ? "1px solid var(--accent-strong)"
                  : "1px solid var(--border)",
                color: active ? "var(--accent-strong)" : "var(--text)",
                cursor: "pointer",
              }}
            >
              {s.label} <b>({s.count})</b>
            </button>
          );
        })}
        <input
          type="search"
          placeholder="Buscar por nombre, DNI, cargo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: "1 1 200px",
            marginLeft: "auto",
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 13,
            background: "var(--surface)",
            color: "var(--text)",
          }}
        />
      </div>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
              minWidth: 1000,
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--surface-muted)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th style={th({ center: true, w: 50 })}>#</th>
                <th style={th()}>Nombre Completo</th>
                <th style={th({ center: true, w: 90 })}>DNI</th>
                <th style={th()}>Cargo</th>
                <th style={th({ center: true, w: 110 })}>Condición</th>
                <th style={th({ center: true, w: 110 })}>Ingreso</th>
                <th style={th({ center: true, w: 160 })}>Antigüedad</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: 40,
                      textAlign: "center",
                      color: "var(--text-faint)",
                    }}
                  >
                    Sin resultados con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filtered.slice(0, 200).map((r, i) => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td
                      style={{
                        ...td({ center: true }),
                        color: "var(--text-faint)",
                        fontSize: 12,
                      }}
                    >
                      {i + 1}
                    </td>
                    <td style={td()}>
                      <Link
                        href={`/personal/${r.id}`}
                        style={{
                          color: "var(--text)",
                          textDecoration: "none",
                          fontWeight: 500,
                        }}
                      >
                        {r.nombre}
                      </Link>
                    </td>
                    <td
                      style={{
                        ...td({ center: true }),
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.dni}
                    </td>
                    <td style={td()}>{r.cargo}</td>
                    <td style={td({ center: true })}>
                      {r.condicionVigente ?? "—"}
                    </td>
                    <td style={td({ center: true })}>
                      {fmtDate(r.fechaIngresoIE)}
                    </td>
                    <td
                      style={{
                        ...td({ center: true }),
                        fontWeight: 700,
                        color: "var(--accent-strong)",
                      }}
                    >
                      {r.mesesExtra > 0
                        ? `${r.anios} años, ${r.mesesExtra} meses`
                        : `${r.anios} años`}
                    </td>
                  </tr>
                ))
              )}
              {filtered.length > 200 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: 14,
                      textAlign: "center",
                      color: "var(--text-faint)",
                      fontSize: 12,
                      background: "var(--surface-muted)",
                    }}
                  >
                    Preview limitado a 200 filas. El xlsx incluye los{" "}
                    {filtered.length} registros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function th(opts: { center?: boolean; w?: number } = {}): React.CSSProperties {
  return {
    padding: "10px 12px",
    textAlign: opts.center ? "center" : "left",
    fontWeight: 600,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "var(--text)",
    width: opts.w,
    whiteSpace: "nowrap",
  };
}

function td(opts: { center?: boolean } = {}): React.CSSProperties {
  return {
    padding: "10px 12px",
    color: "var(--text)",
    textAlign: opts.center ? "center" : "left",
    verticalAlign: "middle",
  };
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 18px",
    borderRadius: 8,
    background: disabled ? "var(--surface-muted)" : "var(--accent-strong)",
    color: disabled ? "var(--text-faint)" : "white",
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    cursor: disabled ? "not-allowed" : "pointer",
    pointerEvents: disabled ? "none" : "auto",
  };
}
