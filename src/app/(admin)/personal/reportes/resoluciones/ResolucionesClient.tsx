"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileText } from "lucide-react";

export type ResRow = {
  id: string;
  nombre: string;
  dni: string;
  cargo: string;
  dependencia: string;
  documentoDesignacion: string;
  correo: string;
  fechaInicio: string;
  fechaCese: string | null;
  notaFinCargo: string | null;
  status: "VIGENTE" | "INDEFINIDA" | "FINALIZADA";
  year: number;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
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

export function ResolucionesClient({ rows }: { rows: ResRow[] }) {
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [incluirFinalizadas, setIncluirFinalizadas] = useState(false);

  const years = useMemo(
    () => [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a),
    [rows],
  );

  const filtered = useMemo(() => {
    let out = rows;
    if (!incluirFinalizadas) out = out.filter((r) => r.status !== "FINALIZADA");
    if (yearFilter != null) out = out.filter((r) => r.year === yearFilter);
    if (query.trim()) {
      const tokens = norm(query).split(/\s+/).filter(Boolean);
      out = out.filter((r) => {
        const hay = norm(
          `${r.nombre} ${r.dni} ${r.cargo} ${r.dependencia} ${r.documentoDesignacion}`,
        );
        return tokens.every((t) => hay.includes(t));
      });
    }
    return out;
  }, [rows, query, yearFilter, incluirFinalizadas]);

  const downloadHref = useMemo(() => {
    const params = new URLSearchParams();
    if (yearFilter != null) params.set("year", String(yearFilter));
    if (incluirFinalizadas) params.set("incluirFinalizadas", "1");
    const qs = params.toString();
    return qs
      ? `/api/personal/reportes/resoluciones?${qs}`
      : "/api/personal/reportes/resoluciones";
  }, [yearFilter, incluirFinalizadas]);

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
            <FileText size={24} /> Resoluciones de designación
          </h1>
          <p
            style={{
              color: "var(--text-faint)",
              fontSize: 14,
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            Designaciones de confianza con número de resolución de Consejo
            Universitario o Rectorado. Filtros por año y status.
          </p>
        </div>
        <a href={downloadHref} download style={primaryBtn(rows.length === 0)}>
          <Download size={14} /> Descargar xlsx
        </a>
      </div>

      {/* Filtros */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          type="search"
          placeholder="Buscar por nombre, DNI, cargo, dependencia o resolución…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: "1 1 280px",
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 13,
            background: "var(--surface)",
            color: "var(--text)",
          }}
        />
        {years.length > 1 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--text-faint)" }}>Año:</span>
            <button
              type="button"
              onClick={() => setYearFilter(null)}
              style={chipStyle(yearFilter === null)}
            >
              Todos
            </button>
            {years.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYearFilter(y)}
                style={chipStyle(yearFilter === y)}
              >
                {y}
              </button>
            ))}
          </div>
        )}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={incluirFinalizadas}
            onChange={(e) => setIncluirFinalizadas(e.target.checked)}
          />
          Incluir finalizadas
        </label>
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
              minWidth: 1200,
            }}
          >
            <thead>
              <tr style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
                <th style={th({ center: true, w: 50 })}>N°</th>
                <th style={th({ center: true, w: 90 })}>DNI</th>
                <th style={th()}>Nombre</th>
                <th style={th()}>Cargo</th>
                <th style={th()}>Dependencia</th>
                <th style={th()}>Resolución</th>
                <th style={th({ center: true, w: 100 })}>Inicio</th>
                <th style={th({ center: true, w: 100 })}>Cese</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{ padding: 40, textAlign: "center", color: "var(--text-faint)" }}
                  >
                    Sin resoluciones con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ ...td({ center: true }), color: "var(--text-faint)", fontSize: 12 }}>
                      {i + 1}
                    </td>
                    <td style={{ ...td({ center: true }), fontVariantNumeric: "tabular-nums" }}>
                      {r.dni}
                    </td>
                    <td style={td()}>{r.nombre}</td>
                    <td style={td()}>{r.cargo}</td>
                    <td style={td()}>
                      <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{r.dependencia}</span>
                    </td>
                    <td style={td()}>
                      <span style={{ fontSize: 12 }}>
                        {r.documentoDesignacion || (
                          <span style={{ color: "var(--text-faint)" }}>—</span>
                        )}
                      </span>
                    </td>
                    <td style={td({ center: true })}>{fmtDate(r.fechaInicio)}</td>
                    <td style={td({ center: true })}>
                      {r.fechaCese ? (
                        fmtDate(r.fechaCese)
                      ) : r.notaFinCargo ? (
                        <span style={{ fontSize: 11, color: "#92400e", fontStyle: "italic" }}>
                          {r.notaFinCargo.slice(0, 40)}…
                        </span>
                      ) : (
                        <span style={{ color: "#065f46", fontWeight: 600 }}>Vigente</span>
                      )}
                    </td>
                  </tr>
                ))
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
function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    background: active ? "var(--accent-soft)" : "var(--surface)",
    border: active ? "1px solid var(--accent-strong)" : "1px solid var(--border)",
    color: active ? "var(--accent-strong)" : "var(--text)",
    cursor: "pointer",
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
