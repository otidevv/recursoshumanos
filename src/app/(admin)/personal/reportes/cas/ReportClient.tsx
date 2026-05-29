"use client";

// Cliente del módulo de Reportes (Personal CAS Determinado).
//
// Vista distinta a /personal/cas: ésta es read-only + foco en el formato del
// REPORTE INTERNO UNAMAD (9 columnas exactas). Permite filtrar, ver preview
// en tabla, seleccionar trabajadores específicos y descargar xlsx.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Info, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { PermFlags, StaffRow, StaffStatus } from "../../types";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  // Componentes UTC para evitar TZ shifts (consistente con StaffClient y el
  // generador xlsx). Ver discusión TZ en docs/tz-notes.md (si existe).
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function normalizeGrado(raw: string | null): string {
  if (!raw) return "—";
  const s = raw.trim().toUpperCase();
  if (s === "BACHILLER") return "Bachiller";
  if (s === "MAGISTER" || s === "MAESTRO" || s === "MAGISTRA") return "Magíster";
  if (s === "DOCTOR" || s === "DOCTORA") return "Doctor";
  const TITULOS_EQUIV = new Set([
    "TITULO",
    "TITULADA",
    "TITULADO",
    "INGENIERO",
    "INGENIERA",
    "ABOGADO",
    "ABOGADA",
    "LICENCIADO",
    "LICENCIADA",
    "CONTADOR PUBLICO",
    "CONTADORA PUBLICA",
    "MEDICO",
    "MEDICA",
  ]);
  if (TITULOS_EQUIV.has(s)) return "Título Profesional";
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function vinculoVigente(status: StaffStatus): {
  label: string;
  color: string;
  bg: string;
} {
  if (status === "ACTIVO")
    return { label: "Sí", color: "#065f46", bg: "#d1fae5" };
  if (status === "LICENCIA")
    return { label: "Sí (con licencia)", color: "#92400e", bg: "#fef3c7" };
  if (status === "FALLECIMIENTO")
    return { label: "No (fallecido)", color: "#991b1b", bg: "#fee2e2" };
  return { label: "No", color: "#991b1b", bg: "#fee2e2" };
}

// Normaliza para búsqueda accent-insensitive (igual que StaffClient).
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function ReportClient({
  rows,
  perms,
}: {
  rows: StaffRow[];
  perms: PermFlags;
}) {
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [includeNoVigente, setIncludeNoVigente] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Cuántos están sin carrera registrada (para enlazar a Calidad de Datos).
  const sinCarrera = useMemo(
    () =>
      rows.filter((r) => !r.carreraEgresado || !r.carreraEgresado.trim()).length,
    [rows],
  );

  // Años disponibles en toda la data
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const r of rows) for (const y of r.availableYears) set.add(y);
    return [...set].sort((a, b) => b - a); // DESC: año más reciente primero
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows;

    if (!includeNoVigente) {
      out = out.filter((r) => r.status === "ACTIVO" || r.status === "LICENCIA");
    }

    if (yearFilter != null) {
      out = out.filter((r) => r.availableYears.includes(yearFilter));
    }

    if (query.trim()) {
      const tokens = norm(query).split(/\s+/).filter(Boolean);
      out = out.filter((r) => {
        const hay = norm(
          [
            r.fullName,
            r.numeroDocumento,
            r.gradoMaximo ?? "",
            r.carreraEgresado ?? "",
            r.dependenciaLabel,
          ].join(" "),
        );
        return tokens.every((t) => hay.includes(t));
      });
    }

    return out;
  }, [rows, query, yearFilter, includeNoVigente]);

  const allSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const someSelected =
    !allSelected && filtered.some((r) => selectedIds.has(r.id));

  function toggleAll() {
    setSelectedIds((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        for (const r of filtered) next.delete(r.id);
        return next;
      }
      const next = new Set(prev);
      for (const r of filtered) next.add(r.id);
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function buildExportUrl(): string {
    const params = new URLSearchParams();
    if (selectedIds.size > 0) {
      params.set("ids", [...selectedIds].join(","));
    } else {
      if (yearFilter != null) params.set("year", String(yearFilter));
      if (includeNoVigente) params.set("includeNoVigente", "1");
    }
    const qs = params.toString();
    return qs ? `/api/personal/reportes?${qs}` : `/api/personal/reportes`;
  }

  function handleExport() {
    const url = buildExportUrl();
    window.location.href = url;
    toast.success(
      selectedIds.size > 0
        ? `Descargando reporte de ${selectedIds.size} trabajador(es) seleccionado(s).`
        : `Descargando reporte (${filtered.length} trabajadores).`,
    );
  }

  const exportSummary = useMemo(() => {
    if (selectedIds.size > 0) {
      return {
        count: selectedIds.size,
        scope: `${selectedIds.size} trabajador(es) seleccionado(s)`,
      };
    }
    return {
      count: filtered.length,
      scope: [
        `${filtered.length} trabajador(es)`,
        yearFilter != null ? `año ${yearFilter}` : "todos los años",
        includeNoVigente ? "vigentes + no vigentes" : "solo vigentes",
      ].join(" · "),
    };
  }, [selectedIds, filtered, yearFilter, includeNoVigente]);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      {/* Encabezado */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 4,
            fontSize: 13,
            color: "var(--text-faint)",
          }}
        >
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
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: "var(--text)",
            margin: 0,
          }}
        >
          Reportes — Personal CAS Determinado
        </h1>
        <p
          style={{
            color: "var(--text-faint)",
            fontSize: 14,
            marginTop: 4,
            marginBottom: 0,
          }}
        >
          Reporte interno UNAMAD con grado académico, escuela profesional,
          oficina y vínculo vigente. Distinto al formato SUNEDU SIU.
        </p>
      </div>

      {/* Toolbar de filtros */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
        }}
      >
        <input
          type="search"
          placeholder="Buscar por nombre, DNI, carrera u oficina…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: "1 1 280px",
            minWidth: 200,
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 14,
            background: "var(--surface)",
            color: "var(--text)",
          }}
        />

        {availableYears.length > 1 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--text-faint)" }}>
              Año:
            </span>
            <button
              type="button"
              onClick={() => setYearFilter(null)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: yearFilter === null ? 600 : 400,
                border:
                  yearFilter === null
                    ? "1px solid var(--accent-strong)"
                    : "1px solid var(--border)",
                background:
                  yearFilter === null ? "var(--accent-soft)" : "var(--surface)",
                color:
                  yearFilter === null ? "var(--accent-strong)" : "var(--text)",
                cursor: "pointer",
              }}
            >
              Todos
            </button>
            {availableYears.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYearFilter(y)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: yearFilter === y ? 600 : 400,
                  border:
                    yearFilter === y
                      ? "1px solid var(--accent-strong)"
                      : "1px solid var(--border)",
                  background:
                    yearFilter === y ? "var(--accent-soft)" : "var(--surface)",
                  color:
                    yearFilter === y ? "var(--accent-strong)" : "var(--text)",
                  cursor: "pointer",
                }}
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
            gap: 8,
            fontSize: 13,
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          <Checkbox
            checked={includeNoVigente}
            onCheckedChange={(v) => setIncludeNoVigente(v === true)}
          />
          Incluir no vigentes (PASIVO / fallecimiento)
        </label>

        {perms.canWrite && sinCarrera > 0 && (
          <Link
            href="/personal/calidad-datos"
            style={{
              marginLeft: "auto",
              padding: "8px 14px",
              borderRadius: 8,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text-faint)",
              fontSize: 12,
              fontWeight: 500,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
            title={`${sinCarrera} trabajador(es) sin carrera registrada`}
          >
            <Info size={14} /> {sinCarrera} sin carrera — revisa en Calidad de
            Datos
          </Link>
        )}
      </div>

      {/* Banner selección */}
      {selectedIds.size > 0 && (
        <div
          style={{
            background: "var(--accent-soft)",
            border: "1px solid var(--accent)",
            color: "var(--accent-strong)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 12,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>
            <b>{selectedIds.size}</b> trabajador(es) seleccionado(s) · el export
            solo incluirá estos.
          </span>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            Limpiar selección
          </Button>
        </div>
      )}

      {/* Tabla preview */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 16,
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
              minWidth: 1100,
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--surface-muted)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th style={cellHead({ width: 42, center: true })}>
                  {perms.canExport && (
                    <Checkbox
                      checked={
                        allSelected ? true : someSelected ? "indeterminate" : false
                      }
                      onCheckedChange={toggleAll}
                      aria-label="Seleccionar todos"
                    />
                  )}
                </th>
                <th style={cellHead({ width: 140 })}>Grado Académico</th>
                <th style={cellHead({ width: 240 })}>Nombre Completo</th>
                <th style={cellHead({ width: 90, center: true })}>DNI</th>
                <th style={cellHead({ width: 110 })}>Celular</th>
                <th style={cellHead({ width: 260 })}>Escuela Profesional</th>
                <th style={cellHead({ width: 220 })}>Oficina o Unidad</th>
                <th style={cellHead({ width: 130, center: true })}>
                  Vínculo Vigente
                </th>
                <th style={cellHead({ width: 100, center: true })}>
                  Fecha de Vínculo
                </th>
                <th style={cellHead({ width: 160 })}>
                  Tipo de Nombramiento
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    style={{
                      padding: 40,
                      textAlign: "center",
                      color: "var(--text-faint)",
                      fontSize: 14,
                    }}
                  >
                    No hay trabajadores que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const v = vinculoVigente(r.status);
                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: selectedIds.has(r.id)
                          ? "var(--accent-softer)"
                          : "transparent",
                      }}
                    >
                      <td style={cellBody({ center: true })}>
                        {perms.canExport && (
                          <Checkbox
                            checked={selectedIds.has(r.id)}
                            onCheckedChange={() => toggleOne(r.id)}
                            aria-label={`Seleccionar ${r.fullName}`}
                          />
                        )}
                      </td>
                      <td style={cellBody()}>{normalizeGrado(r.gradoMaximo)}</td>
                      <td style={cellBody()}>{r.fullName}</td>
                      <td
                        style={{
                          ...cellBody({ center: true }),
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {r.numeroDocumento}
                      </td>
                      <td style={cellBody()}>{r.celular ?? "—"}</td>
                      <td style={cellBody()}>{r.carreraEgresado ?? "—"}</td>
                      <td style={cellBody()}>{r.dependenciaLabel}</td>
                      <td style={cellBody({ center: true })}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            background: v.bg,
                            color: v.color,
                          }}
                        >
                          {v.label}
                        </span>
                      </td>
                      <td style={cellBody({ center: true })}>
                        {fmtDate(r.contractInicio)}
                      </td>
                      <td style={cellBody()}>CAS – DL N° 1057</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer con export */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--text-faint)" }}>
          {filtered.length === rows.length
            ? `${rows.length} trabajadores CAS en total.`
            : `Mostrando ${filtered.length} de ${rows.length} trabajadores CAS.`}
        </div>

        {perms.canExport && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                disabled={filtered.length === 0 && selectedIds.size === 0}
                style={{ fontWeight: 700 }}
              >
                <Download size={14} /> Exportar Reporte CAS (xlsx)
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar exportación</AlertDialogTitle>
                <AlertDialogDescription>
                  Se descargará un archivo xlsx con <b>{exportSummary.count}</b>{" "}
                  registro(s).
                  <br />
                  <span
                    style={{
                      display: "block",
                      marginTop: 8,
                      fontSize: 12,
                      color: "var(--text-faint)",
                    }}
                  >
                    {exportSummary.scope}
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleExport}>
                  Descargar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

// ── Helpers de estilo (sin componentes adicionales, mantiene este archivo
// autocontenido y editable) ──
function cellHead(opts: { width?: number; center?: boolean } = {}): React.CSSProperties {
  return {
    padding: "10px 12px",
    textAlign: opts.center ? "center" : "left",
    fontWeight: 600,
    color: "var(--text)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    width: opts.width,
    whiteSpace: "nowrap",
  };
}

function cellBody(opts: { center?: boolean } = {}): React.CSSProperties {
  return {
    padding: "10px 12px",
    color: "var(--text)",
    textAlign: opts.center ? "center" : "left",
    verticalAlign: "middle",
  };
}

