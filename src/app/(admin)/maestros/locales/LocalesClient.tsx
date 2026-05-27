"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/admin/Icon";
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
import { UBIGEOS } from "@/lib/sunedu";
import {
  createLocal,
  deleteLocal,
  setLocalActive,
  updateLocal,
} from "./actions";
import type { ActionResult, LocalRow, PermFlags } from "./types";

type Props = {
  rows: LocalRow[];
  perms: PermFlags;
};

type FormState = {
  code: string;
  name: string;
  sedeFilial: "S" | "F";
  ubigeoCode: string;
  direccion: string;
  tipoAutorizacion: string;
};

const EMPTY_FORM: FormState = {
  code: "",
  name: "",
  sedeFilial: "S",
  ubigeoCode: "",
  direccion: "",
  tipoAutorizacion: "",
};

export function LocalesClient({ rows, perms }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<LocalRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<LocalRow | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(
    null,
  );

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.direccion.toLowerCase().includes(q) ||
        r.ubigeoLabel.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="page">
      <div className="page__tabs">
        <button className="tab is-active">Sedes</button>
      </div>

      <div className="page__head">
        <div className="page__title">
          <h1>Sedes UNAMAD</h1>
          <span className="page__sub">
            {rows.length} registradas ·{" "}
            {rows.filter((r) => r.active).length} activas
            {isPending && (
              <span style={{ marginLeft: 12, color: "var(--accent)" }}>
                · actualizando…
              </span>
            )}
          </span>
        </div>
        <div className="page__actions">
          <button
            className="btn--cta"
            disabled={!perms.canWrite}
            onClick={() => setCreating(true)}
          >
            <Icon name="plus" size={16} />
            <span>Nueva sede</span>
          </button>
        </div>
      </div>

      <div className="filterbar">
        <input
          className="ubi-search"
          placeholder="Buscar por código, nombre, dirección o ubigeo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="tablewrap density-regular">
        <div className="tablewrap__scroll">
          <table className="dtable">
            <thead>
              <tr>
                <th style={{ width: 88 }}>Código</th>
                <th>Nombre</th>
                <th style={{ width: 80 }}>Tipo</th>
                <th>Ubigeo</th>
                <th>Dirección</th>
                <th style={{ width: 100 }}>Estado</th>
                <th className="dtable__settings"> </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td data-label="Código">
                    <code style={{ fontSize: 12 }}>{l.code}</code>
                  </td>
                  <td data-label="Nombre">
                    <div style={{ fontWeight: 500 }}>{l.name}</div>
                    {l.tipoAutorizacion && (
                      <div
                        style={{ fontSize: 12, color: "var(--text-muted)" }}
                      >
                        {l.tipoAutorizacion}
                      </div>
                    )}
                  </td>
                  <td data-label="Tipo">
                    <span className="badge badge--neutral">
                      {l.sedeFilial === "S" ? "Sede" : "Filial"}
                    </span>
                  </td>
                  <td className="dtable__muted" data-label="Ubigeo">
                    <div>{l.ubigeoLabel}</div>
                    <div style={{ fontSize: 11 }}>{l.ubigeoCode}</div>
                  </td>
                  <td className="dtable__muted" data-label="Dirección">
                    {l.direccion}
                  </td>
                  <td data-label="Estado">
                    <span
                      className={`badge ${
                        l.active ? "badge--green" : "badge--neutral"
                      }`}
                    >
                      {l.active ? "Activa" : "Suspendida"}
                    </span>
                  </td>
                  <td
                    className="dtable__settings"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    <button
                      className="iconbtn iconbtn--small"
                      aria-label="Editar"
                      title="Editar"
                      disabled={!perms.canWrite}
                      onClick={() => setEditing(l)}
                    >
                      <Icon name="user" size={16} />
                    </button>
                    <button
                      className="iconbtn iconbtn--small"
                      aria-label={l.active ? "Suspender" : "Reactivar"}
                      title={l.active ? "Suspender" : "Reactivar"}
                      disabled={!perms.canWrite}
                      onClick={async () => {
                        const res = await setLocalActive(l.id, !l.active);
                        if (res.ok) {
                          setToast({
                            kind: "ok",
                            msg: l.active
                              ? "Sede suspendida."
                              : "Sede reactivada.",
                          });
                          refresh();
                        } else {
                          setToast({ kind: "err", msg: res.error });
                        }
                      }}
                    >
                      <Icon name="lock" size={16} />
                    </button>
                    <button
                      className="iconbtn iconbtn--small"
                      aria-label="Eliminar"
                      title="Eliminar"
                      disabled={!perms.canWrite}
                      onClick={() => setConfirmDelete(l)}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr className="dtable__empty">
                  <td colSpan={7}>
                    <div className="empty">
                      <Icon name="search" size={32} />
                      <h3>Sin sedes</h3>
                      <p>
                        {query
                          ? "Ningún resultado para tu búsqueda."
                          : "Aún no hay sedes registradas."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="tablefoot">
          <span>
            {filtered.length} de {rows.length} sedes
          </span>
        </div>
      </div>

      {(creating || editing) && (
        <LocalModal
          initial={
            editing
              ? {
                  code: editing.code,
                  name: editing.name,
                  sedeFilial: editing.sedeFilial as "S" | "F",
                  ubigeoCode: editing.ubigeoCode,
                  direccion: editing.direccion,
                  tipoAutorizacion: editing.tipoAutorizacion ?? "",
                }
              : EMPTY_FORM
          }
          title={editing ? `Editar sede ${editing.code}` : "Nueva sede"}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={async (form) => {
            const res = editing
              ? await updateLocal(editing.id, form)
              : await createLocal(form);
            if (res.ok) {
              setToast({
                kind: "ok",
                msg: editing ? "Sede actualizada." : "Sede creada.",
              });
              setCreating(false);
              setEditing(null);
              refresh();
            }
            return res;
          }}
        />
      )}

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
              }}
            >
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "#fee2e2",
                  color: "#b91c1c",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="trash" size={20} />
              </span>
              <div style={{ flex: 1 }}>
                <AlertDialogTitle>
                  Eliminar sede {confirmDelete?.code}
                </AlertDialogTitle>
                <AlertDialogDescription style={{ marginTop: 6 }}>
                  Esta acción es <b>irreversible</b>. Si la sede está asignada
                  a algún trabajador, el sistema te lo indicará y deberás
                  suspenderla en su lugar.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!confirmDelete) return;
                const res = await deleteLocal(confirmDelete.id);
                if (res.ok) {
                  setToast({ kind: "ok", msg: "Sede eliminada." });
                  refresh();
                } else {
                  setToast({ kind: "err", msg: res.error });
                }
                setConfirmDelete(null);
              }}
            >
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {toast && (
        <div className="toasts">
          <div
            className={`toast ${
              toast.kind === "ok" ? "toast--success" : "toast--error"
            }`}
          >
            {toast.msg}
          </div>
        </div>
      )}

      <style jsx>{`
        .ubi-search {
          width: 100%;
          max-width: 460px;
          height: 36px;
          padding: 0 12px;
          border: 1px solid var(--border-strong);
          border-radius: 8px;
          background: var(--surface);
          font: inherit;
          font-size: 13.5px;
        }
        .ubi-search:focus {
          outline: 0;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────── Modal ───────────────────────────

function LocalModal({
  initial,
  title,
  onClose,
  onSubmit,
}: {
  initial: FormState;
  title: string;
  onClose: () => void;
  onSubmit: (form: FormState) => Promise<ActionResult<{ id: string } | void>>;
}) {
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<string, string>>
  >({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setTopError(null);
    setFieldErrors({});
    const res = await onSubmit(form);
    if (!res.ok) {
      setTopError(res.error);
      if (res.fieldErrors) setFieldErrors(res.fieldErrors);
    }
    setSubmitting(false);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} style={{ maxWidth: 640 }}>
        <div className="modal__head">
          <h2>{title}</h2>
          <button
            type="button"
            className="iconbtn iconbtn--small"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="modal__body">
          {topError && (
            <div
              style={{
                background: "#fee2e2",
                color: "#991b1b",
                padding: "10px 12px",
                borderRadius: 8,
                marginBottom: 14,
                fontSize: 13,
              }}
            >
              {topError}
            </div>
          )}

          <div className="modal__row">
            <div className="field">
              <label className="field__label">
                Código <span className="field__req">*</span>
              </label>
              <input
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase() })
                }
                placeholder="SL03"
                maxLength={6}
                required
                style={{ textTransform: "uppercase" }}
              />
              {fieldErrors.code && (
                <small style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>
                  {fieldErrors.code}
                </small>
              )}
            </div>
            <div className="field">
              <label className="field__label">
                Tipo <span className="field__req">*</span>
              </label>
              <select
                value={form.sedeFilial}
                onChange={(e) =>
                  setForm({
                    ...form,
                    sedeFilial: e.target.value as "S" | "F",
                  })
                }
              >
                <option value="S">Sede</option>
                <option value="F">Filial</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label className="field__label">
              Nombre <span className="field__req">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Sede Tambopata — Av. Jorge Chávez"
              maxLength={120}
              required
            />
            {fieldErrors.name && (
              <small style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>
                {fieldErrors.name}
              </small>
            )}
          </div>

          <UbigeoField
            value={form.ubigeoCode}
            onChange={(v) => setForm({ ...form, ubigeoCode: v })}
            error={fieldErrors.ubigeoCode}
          />

          <div className="field">
            <label className="field__label">
              Dirección <span className="field__req">*</span>
            </label>
            <input
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              placeholder="AVENIDA JORGE CHÁVEZ N° 1160"
              maxLength={200}
              required
            />
            {fieldErrors.direccion && (
              <small style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>
                {fieldErrors.direccion}
              </small>
            )}
          </div>

          <div className="field">
            <label className="field__label">Tipo de autorización</label>
            <input
              value={form.tipoAutorizacion}
              onChange={(e) =>
                setForm({ ...form, tipoAutorizacion: e.target.value })
              }
              placeholder="Autorizado por Lic."
              maxLength={120}
            />
          </div>
        </div>

        <div className="modal__foot">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={submitting}
          >
            {submitting ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────── Ubigeo combobox ───────────────────────────

function UbigeoField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (code: string) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => UBIGEOS.find((u) => u.code === value) ?? null,
    [value],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return UBIGEOS.slice(0, 50);
    const out = [];
    for (const u of UBIGEOS) {
      const t = `${u.departamento} ${u.provincia} ${u.distrito} ${u.code}`.toLowerCase();
      if (t.includes(q)) out.push(u);
      if (out.length >= 50) break;
    }
    return out;
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className="field" ref={ref}>
      <label className="field__label">
        Ubigeo (departamento / provincia / distrito){" "}
        <span className="field__req">*</span>
      </label>
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            width: "100%",
            textAlign: "left",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            padding: "10px 12px",
            background: "var(--surface)",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {selected
            ? `${selected.departamento} / ${selected.provincia} / ${selected.distrito} (${selected.code})`
            : "— seleccionar —"}
        </button>
        {open && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "var(--shadow-lg)",
              zIndex: 100,
              maxHeight: 320,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar…"
              style={{
                margin: 8,
                padding: "8px 10px",
                border: "1px solid var(--border-strong)",
                borderRadius: 6,
                fontSize: 13,
                outline: "none",
              }}
            />
            <div style={{ overflow: "auto", flex: 1 }}>
              {matches.map((u) => (
                <button
                  type="button"
                  key={u.code}
                  onClick={() => {
                    onChange(u.code);
                    setOpen(false);
                    setQuery("");
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: 0,
                    background: u.code === value ? "var(--accent-soft)" : "transparent",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 500 }}>
                    {u.departamento} / {u.provincia} / {u.distrito}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {u.code}
                  </div>
                </button>
              ))}
              {matches.length === 0 && (
                <div
                  style={{
                    padding: 16,
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: 13,
                  }}
                >
                  Sin resultados
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {error && (
        <small style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>
          {error}
        </small>
      )}
    </div>
  );
}

// Legacy ConfirmDelete eliminado — ahora se usa AlertDialog de shadcn.
