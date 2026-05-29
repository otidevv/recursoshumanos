"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Download } from "lucide-react";

export type LisRow = {
  id: string;
  nombre: string;
  dni: string;
  cargo: string;
  unidad: string;
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function ListadoClient({ rows }: { rows: LisRow[] }) {
  const [query, setQuery] = useState("");
  const [groupByUnidad, setGroupByUnidad] = useState(true);
  const [unidadFilter, setUnidadFilter] = useState<string | null>(null);

  const unidades = useMemo(
    () => [...new Set(rows.map((r) => r.unidad))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    let out = rows;
    if (unidadFilter) out = out.filter((r) => r.unidad === unidadFilter);
    if (query.trim()) {
      const tokens = norm(query).split(/\s+/).filter(Boolean);
      out = out.filter((r) => {
        const hay = norm(`${r.nombre} ${r.dni} ${r.cargo} ${r.unidad}`);
        return tokens.every((t) => hay.includes(t));
      });
    }
    return out;
  }, [rows, query, unidadFilter]);

  const grouped = useMemo(() => {
    if (!groupByUnidad) return null;
    const map = new Map<string, LisRow[]>();
    for (const r of filtered) {
      const arr = map.get(r.unidad) ?? [];
      arr.push(r);
      map.set(r.unidad, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, groupByUnidad]);

  const downloadHref = `/api/personal/reportes/listado-oficial${groupByUnidad ? "?group=unidad" : ""}`;

  return (
    <div style={{ padding: 24, maxWidth: 1300, margin: "0 auto" }}>
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
            <ClipboardList size={24} /> Listado oficial por unidad
          </h1>
          <p
            style={{
              color: "var(--text-faint)",
              fontSize: 14,
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            Formato corto para entregar a oficinas externas (Apellidos, DNI,
            Cargo, Unidad). Agrupable por unidad con cabeceras y subtotales.
          </p>
        </div>
        <a href={downloadHref} download style={primaryBtn(rows.length === 0)}>
          <Download size={14} /> Descargar xlsx
        </a>
      </div>

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
          placeholder="Buscar por nombre, DNI, cargo o unidad…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: "1 1 240px",
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 13,
            background: "var(--surface)",
            color: "var(--text)",
          }}
        />
        <select
          value={unidadFilter ?? ""}
          onChange={(e) => setUnidadFilter(e.target.value || null)}
          style={selectStyle}
        >
          <option value="">Todas las unidades ({unidades.length})</option>
          {unidades.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
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
            checked={groupByUnidad}
            onChange={(e) => setGroupByUnidad(e.target.checked)}
          />
          Agrupar por unidad
        </label>
        <span style={{ fontSize: 12, color: "var(--text-faint)", marginLeft: "auto" }}>
          {filtered.length} de {rows.length}
        </span>
      </div>

      {/* Render — agrupado o lista plana */}
      {groupByUnidad && grouped ? (
        grouped.map(([unidad, gRows]) => (
          <div
            key={unidad}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              overflow: "hidden",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                background: "var(--accent-soft)",
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--accent-strong)",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{unidad}</span>
              <span>{gRows.length} trabajadores</span>
            </div>
            <Table rows={gRows} startNum={1} />
          </div>
        ))
      ) : (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <Table rows={filtered.slice(0, 300)} startNum={1} />
          {filtered.length > 300 && (
            <div
              style={{
                padding: 14,
                textAlign: "center",
                fontSize: 12,
                color: "var(--text-faint)",
                background: "var(--surface-muted)",
              }}
            >
              Preview limitado a 300 filas. El xlsx incluye los {filtered.length} registros.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Table({ rows, startNum }: { rows: LisRow[]; startNum: number }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
            <th style={th({ center: true, w: 50 })}>N°</th>
            <th style={th()}>Apellidos y Nombres</th>
            <th style={th({ center: true, w: 90 })}>DNI</th>
            <th style={th()}>Cargo</th>
            <th style={th()}>Unidad</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ ...td({ center: true }), color: "var(--text-faint)", fontSize: 12 }}>
                {startNum + i}
              </td>
              <td style={td()}>
                <Link
                  href={`/personal/${r.id}`}
                  style={{ color: "var(--text)", textDecoration: "none", fontWeight: 500 }}
                >
                  {r.nombre}
                </Link>
              </td>
              <td style={{ ...td({ center: true }), fontVariantNumeric: "tabular-nums" }}>
                {r.dni}
              </td>
              <td style={td()}>{r.cargo}</td>
              <td style={td()}>
                <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{r.unidad}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
const selectStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 13,
  background: "var(--surface)",
  color: "var(--text)",
  cursor: "pointer",
  minWidth: 220,
};
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
