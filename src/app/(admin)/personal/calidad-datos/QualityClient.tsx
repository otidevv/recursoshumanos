"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Briefcase,
  Building2,
  Cake,
  Check,
  GraduationCap,
  ArrowLeftRight,
  RefreshCw,
  Pencil,
  User,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
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
import type { IssueKind, IssueRow, QualityData } from "./loader";

type TabKey = IssueKind;

const TABS: {
  key: TabKey;
  label: string;
  description: string;
  Icon: LucideIcon;
  bg: string;
}[] = [
  {
    key: "cargo-placeholder",
    label: "Cargo placeholder",
    description:
      "Trabajadores con cargoCode=1 (default de migración). Edita y selecciona el cargo SUNEDU real.",
    Icon: Briefcase,
    bg: "#fef3c7",
  },
  {
    key: "dependencia-placeholder",
    label: "Dependencia placeholder",
    description:
      "Trabajadores con dependenciaCode=9 (default de migración). Asigna la oficina/unidad real.",
    Icon: Building2,
    bg: "#dbeafe",
  },
  {
    key: "fecha-nac-placeholder",
    label: "Fecha de nacimiento ficticia",
    description:
      "Trabajadores con fechaNacimiento anterior a 1940 — placeholder de migración (1900-01-01). El botón consulta RENIEC y rellena con la fecha real.",
    Icon: Cake,
    bg: "#fee2e2",
  },
  {
    key: "sin-carrera",
    label: "Sin carrera profesional",
    description:
      "Trabajadores CAS DETERMINADO sin carrera registrada. El botón consulta DAA y llena los que sean egresados UNAMAD.",
    Icon: GraduationCap,
    bg: "#ede9fe",
  },
  {
    key: "nombres-swapped",
    label: "Posibles nombres invertidos",
    description:
      "Heurística: el primer apellido es un nombre típico Y los nombres contienen un apellido típico (ambas condiciones). El botón consulta RENIEC y corrige si coincide.",
    Icon: ArrowLeftRight,
    bg: "#ffedd5",
  },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function QualityClient({ data }: { data: QualityData }) {
  const router = useRouter();
  const counts: Record<TabKey, number> = {
    "cargo-placeholder": data.cargoPlaceholder.length,
    "dependencia-placeholder": data.dependenciaPlaceholder.length,
    "fecha-nac-placeholder": data.fechaNacPlaceholder.length,
    "sin-carrera": data.sinCarrera.length,
    "nombres-swapped": data.nombresSwapped.length,
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const defaultTab = TABS.find((t) => counts[t.key] > 0)?.key ?? "cargo-placeholder";
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
  const [syncing, setSyncing] = useState<TabKey | null>(null);

  // Filtros internos del tab
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [condicionFilter, setCondicionFilter] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  const baseRows: IssueRow[] = (() => {
    switch (activeTab) {
      case "cargo-placeholder":
        return data.cargoPlaceholder;
      case "dependencia-placeholder":
        return data.dependenciaPlaceholder;
      case "fecha-nac-placeholder":
        return data.fechaNacPlaceholder;
      case "sin-carrera":
        return data.sinCarrera;
      case "nombres-swapped":
        return data.nombresSwapped;
    }
  })();

  const filteredRows = useMemo(() => {
    let out = baseRows;
    if (statusFilter) out = out.filter((r) => r.status === statusFilter);
    if (condicionFilter) out = out.filter((r) => r.currentCondicion === condicionFilter);
    if (query.trim()) {
      const tokens = norm(query).split(/\s+/).filter(Boolean);
      out = out.filter((r) => {
        const hay = norm(
          [
            r.nombreCompleto,
            r.dni,
            r.cargoLabel,
            r.dependenciaLabel,
            r.carreraEgresado ?? "",
          ].join(" "),
        );
        return tokens.every((t) => hay.includes(t));
      });
    }
    return out;
  }, [baseRows, query, statusFilter, condicionFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Cuando cambias tab, resetea filtros y página
  function changeTab(t: TabKey) {
    setActiveTab(t);
    setQuery("");
    setStatusFilter(null);
    setCondicionFilter(null);
    setPage(1);
  }

  const tabMeta = TABS.find((t) => t.key === activeTab)!;

  // Severity por tab (porcentaje del total)
  const severityOf = (tabKey: TabKey): { pct: number; level: "low" | "mid" | "high" | "critical" } => {
    if (data.totalStaff === 0) return { pct: 0, level: "low" };
    const pct = Math.round((counts[tabKey] / data.totalStaff) * 100);
    const level: "low" | "mid" | "high" | "critical" =
      pct === 0 ? "low" : pct < 25 ? "low" : pct < 50 ? "mid" : pct < 90 ? "high" : "critical";
    return { pct, level };
  };

  async function runSync(label: string, endpoint: string, body?: BodyInit) {
    if (syncing) return;
    setSyncing(activeTab);
    const t = toast.loading(label);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });
      const json = await res.json();
      toast.dismiss(t);
      if (!res.ok) {
        toast.error(json?.error ?? "Error en sincronización.");
        return;
      }
      toast.success(syncResultMessage(activeTab, json), { duration: 9000 });
      router.refresh();
    } catch (e) {
      toast.dismiss(t);
      toast.error(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setSyncing(null);
    }
  }

  async function handleSyncCarreras() {
    await runSync(`Consultando DAA…`, "/api/personal/sync-carreras");
  }
  async function handleSyncFechas() {
    await runSync(`Consultando RENIEC…`, "/api/personal/sync-fechas-nacimiento");
  }
  async function handleSyncNombres() {
    const ids = data.nombresSwapped.map((r) => r.id);
    await runSync(
      `Verificando con RENIEC…`,
      "/api/personal/sync-nombres",
      JSON.stringify({ ids }),
    );
  }

  // Status / condicion options dentro de los rows
  const statusOptions = useMemo(
    () => [...new Set(baseRows.map((r) => r.status))].sort(),
    [baseRows],
  );
  const condicionOptions = useMemo(
    () => [...new Set(baseRows.map((r) => r.currentCondicion).filter(Boolean) as string[])].sort(),
    [baseRows],
  );

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      {/* Encabezado */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 4, fontSize: 13 }}>
          <Link
            href="/dashboard"
            style={{
              color: "var(--accent-strong)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <ArrowLeft size={14} /> Volver al Dashboard
          </Link>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", margin: 0 }}>
          Calidad de Datos
        </h1>
        <p style={{ color: "var(--text-faint)", fontSize: 14, marginTop: 4, marginBottom: 0 }}>
          {total === 0
            ? `Sin issues detectados sobre los ${data.totalStaff} trabajadores.`
            : `${total} registro(s) con problemas detectados sobre ${data.totalStaff} trabajadores en total. Categorías con sync APIs disponibles: RENIEC + DAA.`}
        </p>
      </div>

      {/* Tabs con barra de severidad */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {TABS.map((t) => {
          const active = activeTab === t.key;
          const { pct, level } = severityOf(t.key);
          const levelColors = {
            low: "#10b981",
            mid: "#f59e0b",
            high: "#ef4444",
            critical: "#7f1d1d",
          };
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => changeTab(t.key)}
              style={{
                position: "relative",
                padding: "12px 16px",
                paddingBottom: 14,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                background: active ? "var(--accent-soft)" : "var(--surface)",
                border: active ? "1px solid var(--accent-strong)" : "1px solid var(--border)",
                color: active ? "var(--accent-strong)" : "var(--text)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                overflow: "hidden",
              }}
            >
              <t.Icon size={16} />
              <span>{t.label}</span>
              <span
                style={{
                  background: counts[t.key] > 0 ? "#dc2626" : "var(--border)",
                  color: "white",
                  padding: "1px 8px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {counts[t.key]}
              </span>
              {counts[t.key] > 0 && (
                <span
                  style={{
                    marginLeft: 4,
                    fontSize: 10,
                    color: levelColors[level],
                    fontWeight: 700,
                  }}
                >
                  {pct}%
                </span>
              )}
              {/* Barra de severidad en el bottom */}
              {counts[t.key] > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 3,
                    background: levelColors[level],
                    opacity: 0.8,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Descripción del tab + botón sync */}
      <div
        style={{
          background: tabMeta.bg,
          borderRadius: 12,
          padding: 14,
          marginBottom: 14,
          fontSize: 13,
          color: "var(--text)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <b
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <tabMeta.Icon size={16} /> {tabMeta.label}
          </b>
          <div style={{ marginTop: 4, color: "#475569" }}>{tabMeta.description}</div>
        </div>
        {(() => {
          const syncCfg = SYNC_BY_TAB[activeTab];
          if (!syncCfg || counts[activeTab] === 0) return null;
          const isBusy = syncing === activeTab;
          const handler =
            activeTab === "sin-carrera"
              ? handleSyncCarreras
              : activeTab === "fecha-nac-placeholder"
                ? handleSyncFechas
                : handleSyncNombres;
          return (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  disabled={isBusy}
                  style={syncBtnStyle(isBusy)}
                >
                  <RefreshCw size={14} className={isBusy ? "animate-spin" : ""} />
                  {isBusy
                    ? "Sincronizando…"
                    : `${syncCfg.btnLabel} (${counts[activeTab]})`}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{syncCfg.confirmTitle}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {syncCfg.confirmBody(counts[activeTab])}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handler}>
                    Sincronizar ahora
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          );
        })()}
      </div>

      {/* Filtros internos del tab */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <input
          type="search"
          placeholder="Buscar por nombre, DNI, cargo, dependencia…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          style={{
            flex: "1 1 240px",
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
          value={statusFilter ?? ""}
          onChange={(e) => {
            setStatusFilter(e.target.value || null);
            setPage(1);
          }}
          style={selectStyle}
        >
          <option value="">Todos los estados</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={condicionFilter ?? ""}
          onChange={(e) => {
            setCondicionFilter(e.target.value || null);
            setPage(1);
          }}
          style={selectStyle}
        >
          <option value="">Todas las condiciones</option>
          {condicionOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: "var(--text-faint)", marginLeft: "auto" }}>
          {filteredRows.length === baseRows.length
            ? `${baseRows.length} registros`
            : `${filteredRows.length} de ${baseRows.length} registros`}
        </span>
      </div>

      {/* Tabla con paginación */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-muted)", borderBottom: "1px solid var(--border)" }}>
                <th style={th()}>Nombre</th>
                <th style={th({ center: true, w: 90 })}>DNI</th>
                <th style={th({ center: true, w: 90 })}>Estado</th>
                <th style={th({ center: true, w: 130 })}>Condición</th>
                <th style={th()}>{detailColumnLabel(activeTab)}</th>
                <th style={th({ center: true, w: 110 })}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--text-faint)", fontSize: 14 }}>
                    {filteredRows.length === 0 && baseRows.length > 0 ? (
                      "Ningún registro coincide con los filtros."
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        Sin registros en esta categoría <Check size={14} />
                      </span>
                    )}
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => {
                  const editPath =
                    r.currentCondicion === "DETERMINADO"
                      ? "/personal/cas"
                      : r.currentCondicion === "INDETERMINADO" || r.currentCondicion === "CONFIANZA"
                        ? "/personal/indeterminados"
                        : "/personal";
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td()}>
                        <Link
                          href={`/personal/${r.id}`}
                          style={{ fontWeight: 500, color: "var(--text)", textDecoration: "none" }}
                          title="Ver ficha completa"
                        >
                          {r.nombreCompleto}
                        </Link>
                      </td>
                      <td style={{ ...td({ center: true }), fontVariantNumeric: "tabular-nums" }}>{r.dni}</td>
                      <td style={td({ center: true })}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            background: statusBg(r.status),
                            color: statusColor(r.status),
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td style={td({ center: true })}>{r.currentCondicion ?? "—"}</td>
                      <td style={td()}>{renderDetail(activeTab, r)}</td>
                      <td style={td({ center: true })}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                          <Link
                            href={`/personal/${r.id}`}
                            title="Ver ficha completa"
                            style={iconBtn()}
                          >
                            <User size={14} />
                          </Link>
                          {/* openId abre el modal de edición automáticamente
                              al cargar el módulo destino. */}
                          <Link
                            href={`${editPath}?openId=${r.id}`}
                            title="Abrir modal de edición"
                            style={iconBtn()}
                          >
                            <Pencil size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {filteredRows.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              borderTop: "1px solid var(--border)",
              fontSize: 12,
              color: "var(--text-faint)",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Por página:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                style={{ ...selectStyle, padding: "4px 8px" }}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredRows.length)} de {filteredRows.length}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={safePage === 1}
                style={pagerBtn(safePage === 1)}
                aria-label="Primera página"
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPage(safePage - 1)}
                disabled={safePage === 1}
                style={pagerBtn(safePage === 1)}
                aria-label="Anterior"
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ padding: "4px 10px", fontWeight: 600, color: "var(--text)" }}>
                {safePage} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage(safePage + 1)}
                disabled={safePage === pageCount}
                style={pagerBtn(safePage === pageCount)}
                aria-label="Siguiente"
              >
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPage(pageCount)}
                disabled={safePage === pageCount}
                style={pagerBtn(safePage === pageCount)}
                aria-label="Última página"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Renderizado contextual de la columna "detalle" según tab ──

function detailColumnLabel(tab: TabKey): string {
  switch (tab) {
    case "cargo-placeholder":
      return "Cargo actual";
    case "dependencia-placeholder":
      return "Dependencia actual";
    case "fecha-nac-placeholder":
      return "Fecha nac. registrada";
    case "sin-carrera":
      return "Carrera";
    case "nombres-swapped":
      return "Detección heurística";
  }
}

function PlaceholderTag() {
  return (
    <span
      style={{
        color: "#dc2626",
        fontSize: 11,
        fontWeight: 600,
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
      }}
    >
      <AlertTriangle size={12} /> placeholder
    </span>
  );
}

function renderDetail(tab: TabKey, r: IssueRow): React.ReactNode {
  if (tab === "cargo-placeholder") {
    return (
      <>
        <code style={codeStyle}>{r.cargoCode}</code>{" "}
        <span style={{ color: "var(--text-faint)", fontSize: 12 }}>
          {r.cargoLabel}
        </span>{" "}
        <PlaceholderTag />
      </>
    );
  }
  if (tab === "dependencia-placeholder") {
    return (
      <>
        <code style={codeStyle}>{r.dependenciaCode}</code>{" "}
        <span style={{ color: "var(--text-faint)", fontSize: 12 }}>
          {r.dependenciaLabel}
        </span>{" "}
        <PlaceholderTag />
      </>
    );
  }
  if (tab === "fecha-nac-placeholder") {
    const d = new Date(r.fechaNacimiento);
    return (
      <>
        <code style={codeStyle}>{d.getUTCFullYear()}</code>{" "}
        <span
          style={{
            color: "#dc2626",
            fontSize: 11,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <AlertTriangle size={12} /> año anterior a 1940
        </span>
      </>
    );
  }
  if (tab === "sin-carrera") {
    return <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>(vacía)</span>;
  }
  if (tab === "nombres-swapped") {
    return (
      <span style={{ fontSize: 12 }}>
        1er apellido = <code style={codeStyle}>{r.primerApellido}</code>{" "}
        <span style={{ color: "var(--text-faint)" }}>(nombre típico)</span>
        {" + "}
        nombres contienen apellido típico
      </span>
    );
  }
  return null;
}

// ── Sync config ──

const SYNC_BY_TAB: Partial<
  Record<
    TabKey,
    {
      btnLabel: string;
      confirmTitle: string;
      confirmBody: (n: number) => string;
    }
  >
> = {
  "sin-carrera": {
    btnLabel: "Sincronizar con DAA",
    confirmTitle: "Sincronizar carreras con DAA",
    confirmBody: (n) =>
      `Se consultará la API DAA para los ${n} trabajadores con carrera vacía y se llenarán los que sean egresados UNAMAD. Puede tomar hasta 1 minuto.`,
  },
  "fecha-nac-placeholder": {
    btnLabel: "Consultar RENIEC",
    confirmTitle: "Sincronizar fechas de nacimiento con RENIEC",
    confirmBody: (n) =>
      `Se consultará RENIEC para los ${n} trabajadores con fecha ficticia (1900-01-01) y se actualizará con la fecha real cuando RENIEC responda. Puede tomar hasta 2 minutos.`,
  },
  "nombres-swapped": {
    btnLabel: "Verificar con RENIEC",
    confirmTitle: "Corregir nombres con RENIEC",
    confirmBody: (n) =>
      `Se consultará RENIEC para los ${n} trabajadores con nombres posiblemente invertidos. Si los tokens coinciden, se corrige el orden automáticamente. Si RENIEC devuelve nombres muy diferentes, NO se actualiza.`,
  },
};

function syncResultMessage(tab: TabKey, json: Record<string, unknown>): string {
  if (tab === "sin-carrera") {
    const { total, encontrados, noEncontrados, errores } = json as {
      total: number;
      encontrados: number;
      noEncontrados: number;
      errores: number;
    };
    if (total === 0) return "No había trabajadores con carrera vacía.";
    return `${encontrados}/${total} carreras actualizadas · ${noEncontrados} sin coincidencia DAA · ${errores} errores.`;
  }
  if (tab === "fecha-nac-placeholder") {
    const { total, actualizados, noEncontrados, errores } = json as {
      total: number;
      actualizados: number;
      noEncontrados: number;
      errores: number;
    };
    if (total === 0) return "No había fechas placeholder.";
    return `${actualizados}/${total} fechas actualizadas · ${noEncontrados} sin coincidencia RENIEC · ${errores} errores.`;
  }
  if (tab === "nombres-swapped") {
    const { total, corregidos, yaCorrectos, noCoincide, noEncontrados, errores } =
      json as {
        total: number;
        corregidos: number;
        yaCorrectos: number;
        noCoincide: number;
        noEncontrados: number;
        errores: number;
      };
    return `${corregidos}/${total} corregidos · ${yaCorrectos} ya estaban OK · ${noCoincide} no coincide RENIEC · ${noEncontrados} no encontrados · ${errores} errores.`;
  }
  return "Sincronización completada.";
}

// ── Helpers de estilo ──

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

const codeStyle: React.CSSProperties = {
  background: "var(--surface-muted)",
  padding: "2px 6px",
  borderRadius: 4,
  fontSize: 11,
  fontFamily: "ui-monospace, monospace",
  fontWeight: 700,
};

const selectStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 13,
  background: "var(--surface)",
  color: "var(--text)",
  cursor: "pointer",
};

function syncBtnStyle(busy: boolean): React.CSSProperties {
  return {
    padding: "10px 16px",
    borderRadius: 8,
    background: "var(--accent-strong)",
    color: "white",
    fontSize: 13,
    fontWeight: 700,
    border: "none",
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.6 : 1,
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };
}

function iconBtn(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    cursor: "pointer",
    fontSize: 14,
    textDecoration: "none",
  };
}

function pagerBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 4,
    border: "1px solid var(--border)",
    background: disabled ? "var(--surface-muted)" : "var(--surface)",
    color: disabled ? "var(--text-faint)" : "var(--text)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13,
  };
}

function statusBg(s: string): string {
  if (s === "ACTIVO") return "#d1fae5";
  if (s === "LICENCIA") return "#fef3c7";
  return "#fee2e2";
}
function statusColor(s: string): string {
  if (s === "ACTIVO") return "#065f46";
  if (s === "LICENCIA") return "#92400e";
  return "#991b1b";
}
