"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type Hit = {
  id: string;
  dni: string;
  nombreCompleto: string;
  cargo: string;
  dependencia: string;
  status: string;
};

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  // Cierre por click fuera
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Atajo: Ctrl+K / Cmd+K para enfocar
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const input = wrapperRef.current?.querySelector("input");
        (input as HTMLInputElement | null)?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Búsqueda debounced
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/personal/search?q=${encodeURIComponent(query)}`,
          { signal: ctrl.signal },
        );
        const body = await res.json();
        if (ctrl.signal.aborted) return;
        if (body.ok) {
          setHits(body.hits);
          setHighlightIdx(0);
        } else {
          setHits([]);
        }
      } catch {
        // ignore (abort or network)
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function goTo(hit: Hit) {
    setOpen(false);
    setQuery("");
    router.push(`/personal/${hit.id}`);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && hits[highlightIdx]) {
      e.preventDefault();
      goTo(hits[highlightIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} style={{ position: "relative", flex: "1 1 380px", maxWidth: 500 }}>
      <div style={{ position: "relative" }}>
        <input
          type="search"
          placeholder="Buscar personal por nombre o DNI… (Ctrl+K)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          style={{
            width: "100%",
            padding: "8px 14px 8px 36px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 13,
            background: "var(--surface)",
            color: "var(--text)",
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            opacity: 0.5,
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            color: "var(--text-faint)",
          }}
        >
          <Search size={14} />
        </span>
      </div>

      {open && (query.trim().length >= 2 || loading) && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
            maxHeight: 400,
            overflowY: "auto",
            zIndex: 100,
          }}
        >
          {loading && (
            <div style={{ padding: 14, fontSize: 13, color: "var(--text-faint)", textAlign: "center" }}>
              Buscando…
            </div>
          )}
          {!loading && hits.length === 0 && (
            <div style={{ padding: 14, fontSize: 13, color: "var(--text-faint)", textAlign: "center" }}>
              Sin resultados para "{query}".
            </div>
          )}
          {!loading && hits.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {hits.map((h, i) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => goTo(h)}
                    onMouseEnter={() => setHighlightIdx(i)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      border: "none",
                      borderBottom: "1px solid var(--border)",
                      background: highlightIdx === i ? "var(--accent-softer)" : "transparent",
                      cursor: "pointer",
                      color: "var(--text)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{h.nombreCompleto}</div>
                      <span
                        style={{
                          padding: "1px 8px",
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 700,
                          background: h.status === "ACTIVO" ? "#d1fae5" : "#fee2e2",
                          color: h.status === "ACTIVO" ? "#065f46" : "#991b1b",
                        }}
                      >
                        {h.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                      DNI {h.dni} · {h.cargo}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
