import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Smartphone,
  AlertTriangle,
} from "lucide-react";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import {
  CARGOS_BY_CODE,
  DEPENDENCIAS_BY_CODE,
  REGIMENES_LABORAL_BY_CODE,
  TIPOS_DOCUMENTO_BY_CODE,
  SEXOS_BY_CODE,
} from "@/lib/sunedu/catalogs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ficha de Trabajador · UNAMAD Admin" };

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("staff.read");
  const { id } = await params;

  const staff = await prisma.administrativeStaff.findUnique({
    where: { id },
    include: {
      vinculos: {
        orderBy: { fechaInicio: "desc" },
      },
      workplaces: {
        include: { local: true },
      },
      designations: {
        orderBy: { fechaInicio: "desc" },
      },
    },
  });

  if (!staff) notFound();

  const apellidos = [staff.primerApellido, staff.segundoApellido]
    .filter(Boolean)
    .join(" ")
    .trim();
  const nombreCompleto = `${apellidos}, ${staff.nombres}`.trim();
  const isVigente = staff.status === "ACTIVO" || staff.status === "LICENCIA";

  // Decide ruta de edición según la condición vigente
  const lastVinculo = staff.vinculos[0] ?? null;
  const editPath =
    lastVinculo?.condicionContrato === "DETERMINADO"
      ? "/personal/cas"
      : lastVinculo?.condicionContrato === "INDETERMINADO"
        ? "/personal/indeterminado"
        : lastVinculo?.condicionContrato === "CONFIANZA"
          ? "/personal/confianza"
          : "/personal";

  // Antigüedad
  const today = new Date();
  const diffDays = Math.floor(
    (today.getTime() - staff.fechaIngresoIE.getTime()) / (24 * 60 * 60 * 1000),
  );
  const aniosAntiguedad = Math.floor(diffDays / 365.25);

  // Cumpleaños — días hasta el próximo
  const fechaNac = staff.fechaNacimiento;
  const yearNow = today.getUTCFullYear();
  let nextCumple = new Date(
    Date.UTC(
      yearNow,
      fechaNac.getUTCMonth(),
      fechaNac.getUTCDate(),
      12,
      0,
      0,
    ),
  );
  if (nextCumple.getTime() < today.getTime()) {
    nextCumple = new Date(
      Date.UTC(
        yearNow + 1,
        fechaNac.getUTCMonth(),
        fechaNac.getUTCDate(),
        12,
        0,
        0,
      ),
    );
  }
  const diasParaCumple = Math.floor(
    (nextCumple.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  const edadActual = yearNow - fechaNac.getUTCFullYear();

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 12, fontSize: 13 }}>
        <Link
          href={editPath}
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

      {/* Header */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 24,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", margin: 0 }}>
              {nombreCompleto}
            </h1>
            <span
              style={{
                padding: "3px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                background: isVigente ? "#d1fae5" : "#fee2e2",
                color: isVigente ? "#065f46" : "#991b1b",
              }}
            >
              {staff.status}
            </span>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--text-faint)" }}>
            <span>DNI {staff.numeroDocumento}</span>
            <span>·</span>
            <span>{TIPOS_DOCUMENTO_BY_CODE.get(staff.tipoDocumentoCode) ?? `Doc ${staff.tipoDocumentoCode}`}</span>
            {staff.celular && (
              <>
                <span>·</span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Smartphone size={12} /> {staff.celular}
                </span>
              </>
            )}
          </div>
        </div>
        <Link
          href={`${editPath}?openId=${staff.id}`}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            background: "var(--accent-strong)",
            color: "white",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Pencil size={14} /> Editar trabajador
        </Link>
      </div>

      {/* Stats compactas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="Antigüedad" value={`${aniosAntiguedad} años`} sub={fmtDate(staff.fechaIngresoIE)} />
        <Stat label="Edad actual" value={`${edadActual} años`} sub={fmtDate(staff.fechaNacimiento)} />
        <Stat label="Próximo cumple" value={`${diasParaCumple} días`} sub={`${pad2(fechaNac.getUTCDate())}/${pad2(fechaNac.getUTCMonth() + 1)}`} />
        <Stat label="Vínculos" value={String(staff.vinculos.length)} sub={`${staff.vinculos.filter((v) => !v.esAdenda).length} principales`} />
        <Stat label="Designaciones" value={String(staff.designations.length)} sub={staff.designations.length === 1 ? "1 registro" : "registros"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Section title="Datos personales">
          <Field label="Sexo" value={SEXOS_BY_CODE.get(staff.sexoCode) ?? `Sexo ${staff.sexoCode}`} />
          <Field label="Fecha de nacimiento" value={fmtDate(staff.fechaNacimiento)} />
          <Field label="País" value={staff.paisNacimientoCode} />
          <Field label="Ubigeo nacimiento" value={staff.ubigeoNacimiento ?? "—"} />
          <Field label="Ubigeo domicilio" value={staff.ubigeoDomicilio} />
          <Field label="Correo institucional" value={staff.correoInstitucional ?? "—"} />
          <Field label="Correo personal" value={staff.correoPersonal ?? "—"} />
          <Field label="Teléfono" value={staff.telefono ?? "—"} />
          <Field label="Celular" value={staff.celular ?? "—"} />
        </Section>

        <Section title="Cargo y dependencia">
          <Field label="Cargo SUNEDU" value={CARGOS_BY_CODE.get(staff.cargoCode) ?? `Cargo ${staff.cargoCode}`} highlight={staff.cargoCode === 1} />
          <Field label="Dependencia SUNEDU" value={DEPENDENCIAS_BY_CODE.get(staff.dependenciaCode) ?? `Dep. ${staff.dependenciaCode}`} highlight={staff.dependenciaCode === 9} />
          <Field label="Puesto detallado" value={staff.puestoDetallado ?? "—"} />
          <Field label="Plaza de origen" value={staff.plazaOrigen ?? "—"} />
          <Field label="Plaza actual" value={staff.plazaActual ?? "—"} />
          <Field label="Grado máximo" value={staff.gradoMaximo ?? "—"} />
          <Field label="Grupo de carrera" value={staff.grupoCarrera ?? "—"} />
          <Field label="Carrera de egreso" value={staff.carreraEgresado ?? "—"} />
        </Section>
      </div>

      {/* Vínculos */}
      <Section title={`Vínculos laborales (${staff.vinculos.length})`} style={{ marginTop: 16 }}>
        {staff.vinculos.length === 0 ? (
          <p style={{ color: "var(--text-faint)", fontSize: 13, margin: 0 }}>Sin vínculos registrados.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-muted)" }}>
                <th style={th()}>Año</th>
                <th style={th()}>Condición</th>
                <th style={th()}>Régimen</th>
                <th style={th()}>Inicio</th>
                <th style={th()}>Término</th>
                <th style={th({ center: true })}>Tipo</th>
              </tr>
            </thead>
            <tbody>
              {staff.vinculos.map((v) => (
                <tr key={v.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={td()}>{v.year ?? v.fechaInicio.getUTCFullYear()}</td>
                  <td style={td()}>{v.condicionContrato}</td>
                  <td style={td()}>{REGIMENES_LABORAL_BY_CODE.get(v.regimenLaboralCode) ?? `Régimen ${v.regimenLaboralCode}`}</td>
                  <td style={td()}>{fmtDate(v.fechaInicio)}</td>
                  <td style={td()}>{v.fechaTermino ? fmtDate(v.fechaTermino) : <span style={{ color: "var(--text-faint)" }}>Vigente</span>}</td>
                  <td style={td({ center: true })}>
                    <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: v.esAdenda ? "#fef3c7" : "#dbeafe", color: v.esAdenda ? "#92400e" : "#1e3a8a" }}>
                      {v.esAdenda ? "Adenda" : "Principal"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Designaciones */}
      {staff.designations.length > 0 && (
        <Section title={`Designaciones de confianza (${staff.designations.length})`} style={{ marginTop: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-muted)" }}>
                <th style={th()}>Cargo</th>
                <th style={th()}>Dependencia</th>
                <th style={th()}>Documento</th>
                <th style={th()}>Inicio</th>
                <th style={th()}>Cese</th>
              </tr>
            </thead>
            <tbody>
              {staff.designations.map((d) => (
                <tr key={d.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={td()}>{d.cargoDesempenado}</td>
                  <td style={td()}>{d.dependencia}</td>
                  <td style={td()}>{d.documentoDesignacion ?? "—"}</td>
                  <td style={td()}>{fmtDate(d.fechaInicio)}</td>
                  <td style={td()}>
                    {d.fechaCese
                      ? fmtDate(d.fechaCese)
                      : d.notaFinCargo
                        ? <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{d.notaFinCargo}</span>
                        : "Vigente"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Workplaces */}
      {staff.workplaces.length > 0 && (
        <Section title={`Locales de trabajo (${staff.workplaces.length})`} style={{ marginTop: 16 }}>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {staff.workplaces.map((w) => (
              <li key={w.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                {w.local ? (
                  <span>
                    <b>{w.local.code}</b> — {w.local.name}
                  </span>
                ) : (
                  <span>
                    Otro local — {w.direccion ?? "(sin dirección)"} (ubigeo {w.ubigeoLocal ?? "—"})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--accent-strong)", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
        ...style,
      }}
    >
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0, marginBottom: 12 }}>{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border)", gap: 12 }}>
      <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          color: highlight ? "#dc2626" : "var(--text)",
          fontWeight: highlight ? 700 : 400,
          textAlign: "right",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {value}
        {highlight && (
          <span
            style={{
              fontSize: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <AlertTriangle size={11} /> placeholder
          </span>
        )}
      </span>
    </div>
  );
}

function th(opts: { center?: boolean } = {}): React.CSSProperties {
  return {
    padding: "8px 10px",
    textAlign: opts.center ? "center" : "left",
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "var(--text)",
  };
}

function td(opts: { center?: boolean } = {}): React.CSSProperties {
  return {
    padding: "8px 10px",
    color: "var(--text)",
    textAlign: opts.center ? "center" : "left",
    verticalAlign: "middle",
  };
}
