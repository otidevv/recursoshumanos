import Link from "next/link";
import {
  Cake,
  CalendarDays,
  ScrollText,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { requireUser } from "@/lib/auth/server";
import { loadDashboard } from "./loader";

export const metadata = { title: "Dashboard · UNAMAD Admin" };
export const dynamic = "force-dynamic";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export default async function Page() {
  const me = await requireUser();
  const data = await loadDashboard();

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", margin: 0 }}>
          Hola, {me.name.split(" ")[0] || "Admin"}
        </h1>
        <p style={{ color: "var(--text-faint)", fontSize: 14, marginTop: 4, marginBottom: 0 }}>
          Resumen del personal administrativo UNAMAD.
        </p>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
        <KpiCard label="Total personal" value={data.totalPersonal} sub={`${data.vigentes} vigentes`} accent="blue" />
        <KpiCard label="CAS Determinado" value={data.porCondicionVigente.DETERMINADO} sub="contrato actual" accent="purple" />
        <KpiCard label="Indeterminados" value={data.porCondicionVigente.INDETERMINADO} sub="contrato actual" accent="green" />
        <KpiCard label="Confianza" value={data.porCondicionVigente.CONFIANZA} sub="contrato actual" accent="orange" />
        <KpiCard label="Designaciones vigentes" value={data.designacionesVigentes + data.designacionesIndefinidas} sub={`${data.designacionesIndefinidas} indefinidas`} accent="blue" />
      </div>

      {/* Alerta de calidad de datos */}
      {(data.conCargoPlaceholder > 0 || data.conDependenciaPlaceholder > 0 || data.conFechaNacPlaceholder > 0 || data.sinCarrera > 0) && (
        <div style={{ background: "#fef3c7", border: "1px solid #facc15", borderRadius: 12, padding: 14, marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div
              style={{
                fontWeight: 700,
                color: "#92400e",
                marginBottom: 4,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <AlertTriangle size={16} /> Datos por revisar
            </div>
            <div style={{ fontSize: 13, color: "#78350f" }}>
              {data.conCargoPlaceholder} con cargo placeholder · {data.conDependenciaPlaceholder} con dependencia placeholder · {data.conFechaNacPlaceholder} con fecha de nacimiento ficticia · {data.sinCarrera} sin carrera registrada.
            </div>
          </div>
          <Link
            href="/personal/calidad-datos"
            style={{
              background: "#92400e",
              color: "white",
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Revisar <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {/* Listas paralelas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
        <Panel
          icon={<Cake size={16} />}
          title="Cumpleaños próximos (31 días)"
          empty="No hay cumpleaños en los próximos 31 días."
        >
          {data.cumpleanosMes.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {data.cumpleanosMes.map((c) => (
                <li key={c.id} style={listItemStyle}>
                  <div style={{ fontWeight: 500 }}>{c.nombre}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-faint)" }}>
                    <span>DNI {c.dni}</span>
                    <span><b style={{ color: "var(--accent-strong)" }}>{c.diaDelAno}</b> — cumple {c.edad}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          icon={<CalendarDays size={16} />}
          title="Contratos CAS por vencer (60 días)"
          empty="No hay contratos CAS por vencer en los próximos 60 días."
        >
          {data.contratosPorVencer.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {data.contratosPorVencer.slice(0, 12).map((c, i) => (
                <li key={`${c.staffId}-${i}`} style={listItemStyle}>
                  <div style={{ fontWeight: 500 }}>{c.nombre}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-faint)" }}>
                    <span>DNI {c.dni}</span>
                    <span>Vence <b style={{ color: c.diasRestantes < 14 ? "#dc2626" : "var(--accent-strong)" }}>{fmtDate(c.fechaTermino)}</b> ({c.diasRestantes}d)</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          icon={<ScrollText size={16} />}
          title="Designaciones por vencer (60 días)"
          empty="No hay designaciones por vencer."
        >
          {data.designacionesPorVencer.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {data.designacionesPorVencer.map((d) => (
                <li key={d.id} style={listItemStyle}>
                  <div style={{ fontWeight: 500 }}>{d.nombreCompleto}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-faint)" }}>
                    <span>{d.cargo}</span>
                    <span>Vence <b style={{ color: d.diasRestantes < 14 ? "#dc2626" : "var(--accent-strong)" }}>{fmtDate(d.fechaCese)}</b> ({d.diasRestantes}d)</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Quick links */}
      <div style={{ marginTop: 24, padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>Accesos rápidos</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <QuickLink href="/personal/cas">CAS Determinado</QuickLink>
          <QuickLink href="/personal/indeterminado">CAS Indeterminado</QuickLink>
          <QuickLink href="/personal/confianza">CAS Confianza</QuickLink>
          <QuickLink href="/personal">Export SUNEDU</QuickLink>
          <QuickLink href="/personal/reportes">Reportes</QuickLink>
          <QuickLink href="/personal/designaciones">Designaciones</QuickLink>
          <QuickLink href="/personal/calidad-datos">Calidad de datos</QuickLink>
        </div>
      </div>
    </div>
  );
}

const listItemStyle: React.CSSProperties = {
  padding: "8px 0",
  borderBottom: "1px solid var(--border)",
};

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub?: string;
  accent: "blue" | "purple" | "green" | "orange" | "red";
}) {
  const colorMap = {
    blue: { bg: "#dbeafe", text: "#1e3a8a" },
    purple: { bg: "#ede9fe", text: "#5b21b6" },
    green: { bg: "#d1fae5", text: "#065f46" },
    orange: { bg: "#ffedd5", text: "#9a3412" },
    red: { bg: "#fee2e2", text: "#991b1b" },
  };
  const c = colorMap[accent];
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, right: 0, width: 60, height: 60, background: c.bg, borderRadius: "0 0 0 60px", opacity: 0.4 }} />
      <div style={{ fontSize: 12, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: c.text, marginTop: 4 }}>
        {value.toLocaleString("es-PE")}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Panel({
  icon,
  title,
  children,
  empty,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  empty: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "var(--text)",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {icon} {title}
      </div>
      {children ?? null}
      {!children && (
        <div
          style={{
            fontSize: 13,
            color: "var(--text-faint)",
            padding: "20px 0",
            textAlign: "center",
          }}
        >
          {empty}
        </div>
      )}
    </div>
  );
}

function QuickLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ padding: "8px 14px", borderRadius: 8, background: "var(--accent-softer)", color: "var(--accent-strong)", fontSize: 13, fontWeight: 600, textDecoration: "none", border: "1px solid var(--border)" }}>
      {children}
    </Link>
  );
}
