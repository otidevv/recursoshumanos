"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Cake, Download } from "lucide-react";

export type CumpleRow = {
  id: string;
  nombre: string;
  dni: string;
  oficina: string;
  cargo: string;
  dia: string;
  mes: string;
  edadACumplir: number;
};

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function CumpleanosClient({
  rows,
  mes,
}: {
  rows: CumpleRow[];
  mes: number;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function setMes(newMes: number) {
    const next = new URLSearchParams(params.toString());
    next.set("mes", String(newMes));
    router.replace(`/personal/reportes/cumpleanos?${next.toString()}`);
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
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
            <Cake size={24} /> Cumpleaños del mes
          </h1>
          <p
            style={{
              color: "var(--text-faint)",
              fontSize: 14,
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            Personal vigente que cumple años en {MESES[mes - 1]}. Excluye
            fechas placeholder (1900-01-01).
          </p>
        </div>
        <a
          href={`/api/personal/reportes/cumpleanos?mes=${mes}`}
          download
          style={primaryBtn(rows.length === 0)}
          aria-disabled={rows.length === 0}
        >
          <Download size={14} /> Descargar xlsx ({rows.length})
        </a>
      </div>

      {/* Selector de mes */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 14,
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text)",
            marginRight: 6,
          }}
        >
          Mes:
        </span>
        {MESES.map((label, i) => {
          const n = i + 1;
          const active = n === mes;
          return (
            <button
              key={n}
              type="button"
              onClick={() => setMes(n)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
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
              {label}
            </button>
          );
        })}
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
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--surface-muted)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th style={th({ center: true, w: 60 })}>Día</th>
                <th style={th()}>Nombre Completo</th>
                <th style={th({ center: true, w: 90 })}>DNI</th>
                <th style={th()}>Oficina</th>
                <th style={th()}>Cargo</th>
                <th style={th({ center: true, w: 80 })}>Edad</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: 40,
                      textAlign: "center",
                      color: "var(--text-faint)",
                      fontSize: 14,
                    }}
                  >
                    Sin cumpleaños registrados en {MESES[mes - 1]}.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td
                      style={{
                        ...td({ center: true }),
                        fontWeight: 700,
                        color: "var(--accent-strong)",
                      }}
                    >
                      {r.dia}
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
                    <td style={td()}>{r.oficina}</td>
                    <td style={td()}>{r.cargo}</td>
                    <td style={td({ center: true })}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "#fee2e2",
                          color: "#991b1b",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {r.edadACumplir}
                      </span>
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
