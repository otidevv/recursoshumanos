"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Loader2,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/alert-dialog";
import {
  createDesignation,
  updateDesignation,
  deleteDesignation,
} from "./actions";
import type {
  DesignationInput,
  DesignationRow,
  DesignationStatus,
} from "./types";
import type { PermFlags } from "../types";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function isoToInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function statusBadge(status: DesignationStatus): {
  label: string;
  color: string;
  bg: string;
} {
  if (status === "VIGENTE")
    return { label: "Vigente", color: "#065f46", bg: "#d1fae5" };
  if (status === "INDEFINIDA")
    return { label: "Indefinida", color: "#92400e", bg: "#fef3c7" };
  return { label: "Finalizada", color: "#475569", bg: "#f1f5f9" };
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const EMPTY_INPUT: DesignationInput = {
  staffId: null,
  dni: "",
  nombreCompleto: "",
  dependencia: "",
  cargoDesempenado: "",
  documentoDesignacion: "",
  correo: "",
  fechaInicio: "",
  fechaCese: "",
  notaFinCargo: "",
};

function rowToInput(r: DesignationRow): DesignationInput {
  return {
    staffId: r.staffId,
    dni: r.dni,
    nombreCompleto: r.nombreCompleto,
    dependencia: r.dependencia,
    cargoDesempenado: r.cargoDesempenado,
    documentoDesignacion: r.documentoDesignacion ?? "",
    correo: r.correo ?? "",
    fechaInicio: isoToInputValue(r.fechaInicio),
    fechaCese: isoToInputValue(r.fechaCese),
    notaFinCargo: r.notaFinCargo ?? "",
  };
}

export function DesignationsClient({
  rows,
  perms,
}: {
  rows: DesignationRow[];
  perms: PermFlags;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DesignationStatus | null>(
    null,
  );
  const [editing, setEditing] = useState<DesignationRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DesignationRow | null>(null);

  const filtered = useMemo(() => {
    let out = rows;
    if (statusFilter) out = out.filter((r) => r.status === statusFilter);
    if (query.trim()) {
      const tokens = norm(query).split(/\s+/).filter(Boolean);
      out = out.filter((r) => {
        const hay = norm(
          [
            r.nombreCompleto,
            r.dni,
            r.dependencia,
            r.cargoDesempenado,
            r.documentoDesignacion ?? "",
          ].join(" "),
        );
        return tokens.every((t) => hay.includes(t));
      });
    }
    return out;
  }, [rows, query, statusFilter]);

  const counts = useMemo(() => {
    const v = rows.filter((r) => r.status === "VIGENTE").length;
    const i = rows.filter((r) => r.status === "INDEFINIDA").length;
    const f = rows.filter((r) => r.status === "FINALIZADA").length;
    return { vigente: v, indefinida: i, finalizada: f, total: rows.length };
  }, [rows]);

  function openNew() {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(r: DesignationRow) {
    setEditing(r);
    setShowForm(true);
  }
  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  async function handleSubmit(input: DesignationInput, id: string | null) {
    const res = id
      ? await updateDesignation(id, input)
      : await createDesignation(input);
    if (!res.ok) {
      toast.error(res.error);
      return res;
    }
    toast.success(id ? "Designación actualizada." : "Designación creada.");
    closeForm();
    router.refresh();
    return res;
  }

  async function handleDelete(r: DesignationRow) {
    const res = await deleteDesignation(r.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Designación eliminada.");
    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      {/* Encabezado */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 4, fontSize: 13 }}>
          <Link
            href="/personal/cas"
            style={{
              color: "var(--accent-strong)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <ArrowLeft size={14} /> Volver a Personal
          </Link>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
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
              }}
            >
              Designaciones de Confianza
            </h1>
            <p
              style={{
                color: "var(--text-faint)",
                fontSize: 14,
                marginTop: 4,
                marginBottom: 0,
              }}
            >
              Personal directivo designado por resolución oficial. Tracking de
              cargos de confianza con fechas de inicio y cese.
            </p>
          </div>
          {perms.canWrite && (
            <Button onClick={openNew} style={{ fontWeight: 700 }}>
              <Plus size={14} /> Nueva designación
            </Button>
          )}
        </div>
      </div>

      {/* Contadores por status */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        {(
          [
            ["VIGENTE", "Vigentes", counts.vigente],
            ["INDEFINIDA", "Indefinidas", counts.indefinida],
            ["FINALIZADA", "Finalizadas", counts.finalizada],
            [null, "Todas", counts.total],
          ] as const
        ).map(([s, label, n]) => {
          const active = statusFilter === s;
          return (
            <button
              key={String(s)}
              type="button"
              onClick={() => setStatusFilter(s as DesignationStatus | null)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                background: active
                  ? "var(--accent-soft)"
                  : "var(--surface)",
                border: active
                  ? "1px solid var(--accent-strong)"
                  : "1px solid var(--border)",
                color: active ? "var(--accent-strong)" : "var(--text)",
                cursor: "pointer",
              }}
            >
              {label} <b>({n})</b>
            </button>
          );
        })}
      </div>

      {/* Búsqueda */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="search"
          placeholder="Buscar por nombre, DNI, cargo, dependencia o resolución…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "10px 14px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 14,
            background: "var(--surface)",
            color: "var(--text)",
          }}
        />
      </div>

      {/* Tabla */}
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
              <tr
                style={{
                  background: "var(--surface-muted)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th style={th()}>Nombre</th>
                <th style={th({ center: true, w: 90 })}>DNI</th>
                <th style={th()}>Dependencia</th>
                <th style={th()}>Cargo</th>
                <th style={th()}>Documento designación</th>
                <th style={th({ center: true, w: 90 })}>Inicio</th>
                <th style={th({ center: true, w: 90 })}>Cese</th>
                <th style={th({ center: true, w: 100 })}>Status</th>
                <th style={th({ center: true, w: 80 })}>Días</th>
                {perms.canWrite && (
                  <th style={th({ center: true, w: 90 })}>Acciones</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={perms.canWrite ? 10 : 9}
                    style={{
                      padding: 40,
                      textAlign: "center",
                      color: "var(--text-faint)",
                      fontSize: 14,
                    }}
                  >
                    No hay designaciones que coincidan.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const b = statusBadge(r.status);
                  return (
                    <tr
                      key={r.id}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td style={td()}>
                        <div style={{ fontWeight: 500 }}>
                          {r.nombreCompleto}
                        </div>
                        {r.staffId == null && (
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--text-faint)",
                              marginTop: 2,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <AlertTriangle size={11} /> No vinculado a Personal
                          </div>
                        )}
                        {r.correo && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--text-faint)",
                              marginTop: 2,
                            }}
                          >
                            {r.correo}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          ...td({ center: true }),
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {r.dni}
                      </td>
                      <td style={td()}>{r.dependencia}</td>
                      <td style={td()}>{r.cargoDesempenado}</td>
                      <td style={td()}>
                        {r.documentoDesignacion ?? (
                          <span style={{ color: "var(--text-faint)" }}>—</span>
                        )}
                      </td>
                      <td style={td({ center: true })}>
                        {fmtDate(r.fechaInicio)}
                      </td>
                      <td style={td({ center: true })}>
                        {r.fechaCese
                          ? fmtDate(r.fechaCese)
                          : r.notaFinCargo
                            ? "—"
                            : "Vigente"}
                        {r.notaFinCargo && (
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--text-faint)",
                              marginTop: 2,
                            }}
                          >
                            {r.notaFinCargo}
                          </div>
                        )}
                      </td>
                      <td style={td({ center: true })}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            background: b.bg,
                            color: b.color,
                          }}
                        >
                          {b.label}
                        </span>
                      </td>
                      <td
                        style={{
                          ...td({ center: true }),
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {r.duracionDias.toLocaleString("es-PE")}
                      </td>
                      {perms.canWrite && (
                        <td style={td({ center: true })}>
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              justifyContent: "center",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => openEdit(r)}
                              title="Editar"
                              style={btnAction()}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(r)}
                              title="Eliminar"
                              style={btnAction({ danger: true })}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de formulario */}
      {showForm && (
        <DesignationFormModal
          key={editing?.id ?? "new"}
          initial={editing ? rowToInput(editing) : EMPTY_INPUT}
          editingId={editing?.id ?? null}
          onCancel={closeForm}
          onSubmit={handleSubmit}
        />
      )}

      {/* AlertDialog de eliminación */}
      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar designación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que deseas eliminar la designación de{" "}
              <b>{deleteTarget?.nombreCompleto}</b> como{" "}
              <b>{deleteTarget?.cargoDesempenado}</b>? Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              style={{ background: "#dc2626", color: "white" }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Modal de form ──────────────────────────────────────────────────

function DesignationFormModal({
  initial,
  editingId,
  onCancel,
  onSubmit,
}: {
  initial: DesignationInput;
  editingId: string | null;
  onCancel: () => void;
  onSubmit: (
    input: DesignationInput,
    id: string | null,
  ) => Promise<
    | { ok: true; data: unknown }
    | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> }
  >;
}) {
  const [form, setForm] = useState<DesignationInput>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<string, string>>
  >({});
  // Auto-fill desde RENIEC al ingresar DNI (solo en create — al editar no
  // queremos pisar nombres ya curados).
  const [dniStatus, setDniStatus] = useState<{
    kind: "idle" | "loading" | "ok" | "fail";
    msg?: string;
  }>({ kind: "idle" });
  const lastLookupRef = useRef<string>("");

  function set<K extends keyof DesignationInput>(k: K, v: DesignationInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Debounced lookup RENIEC al tipear 8 dígitos en DNI (solo en modo create).
  useEffect(() => {
    if (editingId) return; // no auto-fill al editar
    const dni = form.dni.trim();
    if (!/^\d{8}$/.test(dni)) {
      setDniStatus({ kind: "idle" });
      return;
    }
    if (lastLookupRef.current === dni) return;

    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setDniStatus({ kind: "loading" });
      try {
        const res = await fetch(`/api/dni/${dni}`, { signal: ctrl.signal });
        const body = await res.json();
        if (ctrl.signal.aborted) return;
        if (body.ok) {
          lastLookupRef.current = dni;
          const d = body.data as {
            nombres: string;
            primerApellido: string;
            segundoApellido: string;
          };
          // Concatenar APELLIDOS NOMBRES estilo DNI (formato canónico SUNEDU).
          const apellidos = [d.primerApellido, d.segundoApellido]
            .filter(Boolean)
            .join(" ")
            .trim();
          const nombreCompleto = `${apellidos}, ${d.nombres}`.trim();
          setForm((f) => ({
            ...f,
            // Solo rellena si el user no ha tipeado nombre manual.
            nombreCompleto: f.nombreCompleto.trim()
              ? f.nombreCompleto
              : nombreCompleto,
          }));
          setDniStatus({ kind: "ok", msg: nombreCompleto });
        } else {
          setDniStatus({
            kind: "fail",
            msg: body.error ?? "DNI no encontrado.",
          });
        }
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setDniStatus({
            kind: "fail",
            msg: e instanceof Error ? e.message : "Error de red.",
          });
        }
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [form.dni, editingId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFieldErrors({});
    const res = await onSubmit(form, editingId);
    if (!res.ok && res.fieldErrors) setFieldErrors(res.fieldErrors);
    setSubmitting(false);
  }

  return (
    <div
      className="modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 16,
      }}
      onClick={onCancel}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: 12,
          padding: 24,
          maxWidth: 700,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            margin: 0,
            marginBottom: 4,
            color: "var(--text)",
          }}
        >
          {editingId ? "Editar designación" : "Nueva designación"}
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 0 }}>
          Personal directivo designado por resolución oficial.
        </p>

        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          <Field label="DNI *" error={fieldErrors.dni}>
            <input
              type="text"
              value={form.dni}
              onChange={(e) => set("dni", e.target.value.replace(/\D/g, ""))}
              maxLength={8}
              required
              style={inputStyle()}
            />
            {dniStatus.kind !== "idle" && (
              <div
                style={{
                  marginTop: 6,
                  padding: "6px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background:
                    dniStatus.kind === "ok"
                      ? "#d1fae5"
                      : dniStatus.kind === "loading"
                        ? "var(--accent-softer)"
                        : "#fef3c7",
                  color:
                    dniStatus.kind === "ok"
                      ? "#065f46"
                      : dniStatus.kind === "loading"
                        ? "var(--accent-strong)"
                        : "#92400e",
                }}
              >
                {dniStatus.kind === "loading" ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Consultando
                    RENIEC…
                  </>
                ) : dniStatus.kind === "ok" ? (
                  <>
                    <Check size={12} /> RENIEC: {dniStatus.msg}
                  </>
                ) : (
                  <>
                    <AlertTriangle size={12} /> {dniStatus.msg}
                  </>
                )}
              </div>
            )}
          </Field>
          <Field label="Nombre completo *" error={fieldErrors.nombreCompleto}>
            <input
              type="text"
              value={form.nombreCompleto}
              onChange={(e) => set("nombreCompleto", e.target.value)}
              maxLength={200}
              required
              style={inputStyle()}
            />
          </Field>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <Field label="Dependencia *" error={fieldErrors.dependencia}>
              <input
                type="text"
                value={form.dependencia}
                onChange={(e) => set("dependencia", e.target.value)}
                maxLength={200}
                required
                style={inputStyle()}
              />
            </Field>
            <Field label="Cargo *" error={fieldErrors.cargoDesempenado}>
              <input
                type="text"
                value={form.cargoDesempenado}
                onChange={(e) => set("cargoDesempenado", e.target.value)}
                maxLength={200}
                required
                style={inputStyle()}
              />
            </Field>
          </div>
          <Field
            label="Documento de designación (ej. Resolución de Consejo Universitario N° XXX-2024-UNAMAD)"
            error={fieldErrors.documentoDesignacion}
          >
            <input
              type="text"
              value={form.documentoDesignacion}
              onChange={(e) => set("documentoDesignacion", e.target.value)}
              maxLength={300}
              style={inputStyle()}
            />
          </Field>
          <Field label="Correo" error={fieldErrors.correo}>
            <input
              type="email"
              value={form.correo}
              onChange={(e) => set("correo", e.target.value)}
              maxLength={200}
              style={inputStyle()}
            />
          </Field>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <Field label="Fecha de inicio *" error={fieldErrors.fechaInicio}>
              <input
                type="date"
                value={form.fechaInicio}
                onChange={(e) => set("fechaInicio", e.target.value)}
                required
                style={inputStyle()}
              />
            </Field>
            <Field
              label="Fecha de cese (vacío = vigente)"
              error={fieldErrors.fechaCese}
            >
              <input
                type="date"
                value={form.fechaCese}
                onChange={(e) => set("fechaCese", e.target.value)}
                style={inputStyle()}
              />
            </Field>
          </div>
          <Field
            label='Nota de fin de cargo (ej. "Hasta que la autoridad designe nuevo titular")'
            error={fieldErrors.notaFinCargo}
          >
            <input
              type="text"
              value={form.notaFinCargo}
              onChange={(e) => set("notaFinCargo", e.target.value)}
              maxLength={300}
              style={inputStyle()}
            />
          </Field>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 20,
          }}
        >
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
      {error && (
        <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
          {error}
        </div>
      )}
    </label>
  );
}

// ── helpers de estilo ──

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

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 14,
    background: "var(--surface)",
    color: "var(--text)",
  };
}

function btnAction(opts: { danger?: boolean } = {}): React.CSSProperties {
  return {
    width: 30,
    height: 30,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: opts.danger ? "#dc2626" : "var(--text)",
    cursor: "pointer",
    fontSize: 14,
  };
}
