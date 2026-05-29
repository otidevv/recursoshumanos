"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Phone } from "lucide-react";

export type DirRow = {
  id: string;
  oficina: string;
  dependenciaCode: number;
  nombre: string;
  dni: string;
  cargo: string;
  correoInstitucional: string;
  correoPersonal: string;
  celular: string;
  status: string;
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function DirectorioClient({ rows }: { rows: DirRow[] }) {
  const [query, setQuery] = useState("");
  const [oficinaFilter, setOficinaFilter] = useState<string | null>(null);

  const oficinas = useMemo(
    () => [...new Set(rows.map((r) => r.oficina))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    let out = rows;
    if (oficinaFilter) out = out.filter((r) => r.oficina === oficinaFilter);
    if (query.trim()) {
      const tokens = norm(query).split(/\s+/).filter(Boolean);
      out = out.filter((r) => {
        const hay = norm(
          [
            r.nombre,
            r.dni,
            r.cargo,
            r.oficina,
            r.correoInstitucional,
            r.celular,
          ].join(" "),
        );
        return tokens.every((t) => hay.includes(t));
      });
    }
    return out;
  }, [rows, query, oficinaFilter]);

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
            <Phone size={24} /> Directorio administrativo
          </h1>
          <p
            style={{
              color: "var(--text-faint)",
              fontSize: 14,
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            Personal vigente con cargo, correos y celular. Agrupado por
            dependencia. Para envíos masivos y consulta interna.
          </p>
        </div>
        <a
          href="/api/personal/reportes/directorio"
          download
          style={primaryBtn(rows.length === 0)}
        >
          <Download size={14} /> Descargar xlsx completo
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
        }}
      >
        <input
          type="search"
          placeholder="Buscar por nombre, DNI, cargo o correo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: "1 1 280px",
            minWidth: 200,
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 13,
            background: "var(--surface)",
            color: "var(--text)",
          }}
        />
        <select
          value={oficinaFilter ?? ""}
          onChange={(e) => setOficinaFilter(e.target.value || null)}
          style={{
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 13,
            background: "var(--surface)",
            color: "var(--text)",
            cursor: "pointer",
            minWidth: 220,
          }}
        >
          <option value="">Todas las oficinas ({oficinas.length})</option>
          {oficinas.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span
          style={{
            fontSize: 12,
            color: "var(--text-faint)",
            marginLeft: "auto",
            alignSelf: "center",
          }}
        >
          {filtered.length === rows.length
            ? `${rows.length} contactos`
            : `${filtered.length} de ${rows.length}`}
        </span>
      </div>

      {/* Tabla preview */}
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
                <th style={th()}>Oficina</th>
                <th style={th()}>Nombre Completo</th>
                <th style={th({ center: true, w: 90 })}>DNI</th>
                <th style={th()}>Cargo</th>
                <th style={th()}>Correo institucional</th>
                <th style={th({ center: true, w: 110 })}>Celular</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
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
                filtered.slice(0, 200).map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td style={td()}>
                      <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
                        {r.oficina}
                      </span>
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
                    <td style={td()}>
                      {r.correoInstitucional || (
                        <span style={{ color: "var(--text-faint)" }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        ...td({ center: true }),
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.celular || (
                        <span style={{ color: "var(--text-faint)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
              {filtered.length > 200 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: 14,
                      textAlign: "center",
                      color: "var(--text-faint)",
                      fontSize: 12,
                      background: "var(--surface-muted)",
                    }}
                  >
                    Preview limitado a 200 filas. El xlsx incluye los{" "}
                    {filtered.length} contactos.
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
