import Link from "next/link";
import {
  Cake,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Phone,
  TrendingUp,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Reportes · UNAMAD Admin" };
export const dynamic = "force-dynamic";

type ReportDef = {
  key: string;
  title: string;
  description: string;
  Icon: LucideIcon;
  href: string;
  stat: (counts: Counts) => string;
  bg: string;
  fg: string;
};

type Counts = {
  cas: number;
  vigentes: number;
  cumpleEsteMes: number;
  totalConOficina: number;
  designacionesActivas: number;
};

const REPORTS: ReportDef[] = [
  {
    key: "cas",
    title: "Personal CAS Determinado",
    description:
      "Reporte interno UNAMAD con 9 columnas: grado académico, nombre, DNI, celular, escuela profesional, oficina, vínculo vigente, fecha de inicio y tipo de contrato. Permite seleccionar trabajadores específicos y filtrar por año.",
    Icon: UserCheck,
    href: "/personal/reportes/cas",
    stat: (c) => `${c.cas} trabajadores CAS`,
    bg: "#dbeafe",
    fg: "#1e3a8a",
  },
  {
    key: "cumpleanos",
    title: "Cumpleaños del mes",
    description:
      "Listado del personal vigente cuyo cumpleaños cae en el mes seleccionado. Útil para comunicar saludos institucionales y planificación de RRHH.",
    Icon: Cake,
    href: "/personal/reportes/cumpleanos",
    stat: (c) => `${c.cumpleEsteMes} este mes`,
    bg: "#fee2e2",
    fg: "#991b1b",
  },
  {
    key: "directorio",
    title: "Directorio administrativo",
    description:
      "Listado completo del personal vigente con oficina, cargo, correos institucional y personal, y celular. Agrupable por dependencia. Para envíos masivos y consulta de contactos.",
    Icon: Phone,
    href: "/personal/reportes/directorio",
    stat: (c) => `${c.vigentes} contactos vigentes`,
    bg: "#d1fae5",
    fg: "#065f46",
  },
  {
    key: "antiguedad",
    title: "Antigüedad del personal",
    description:
      "Reporte ordenado por antigüedad (años + meses). Sirve para escalafón, beneficios sociales y reportes a la Oficina General de Recursos Humanos.",
    Icon: TrendingUp,
    href: "/personal/reportes/antiguedad",
    stat: (c) => `${c.vigentes} con antigüedad calculable`,
    bg: "#ede9fe",
    fg: "#5b21b6",
  },
  {
    key: "listado-oficial",
    title: "Listado oficial por unidad",
    description:
      "Formato corto (N° / Apellidos / DNI / Cargo / Unidad) para entregar a oficinas externas. Agrupable por unidad con encabezado y subtotal. Versión simplificada del directorio.",
    Icon: ClipboardList,
    href: "/personal/reportes/listado-oficial",
    stat: (c) => `${c.vigentes} trabajadores`,
    bg: "#fef3c7",
    fg: "#92400e",
  },
  {
    key: "resoluciones",
    title: "Resoluciones de designación",
    description:
      "Lista de personal de confianza con su resolución oficial (Consejo Universitario / Rectorado), fechas de inicio y cese. Filtros por año y status.",
    Icon: FileText,
    href: "/personal/reportes/resoluciones",
    stat: (c) => `${c.designacionesActivas} designaciones activas`,
    bg: "#cffafe",
    fg: "#155e75",
  },
  {
    key: "sunedu",
    title: "Export SUNEDU SIU",
    description:
      "Carga masiva SUNEDU SIU (formato xlsx oficial). Personal vigente para el cumplimiento del registro de docentes y administrativos. Página dedicada con filtros año/variante/selección.",
    Icon: FileSpreadsheet,
    href: "/personal",
    stat: (c) => `${c.vigentes} en padrón vigente`,
    bg: "#ffedd5",
    fg: "#9a3412",
  },
];

export default async function Page() {
  await requirePermission("staff.read");
  const todayMes = new Date().getUTCMonth() + 1;

  const [casCount, vigentesCount, cumpleEsteMes, designacionesActivas] =
    await Promise.all([
      prisma.administrativeStaff.count({
        where: {
          status: { in: ["ACTIVO", "LICENCIA"] },
          vinculos: { some: { condicionContrato: "DETERMINADO" } },
        },
      }),
      prisma.administrativeStaff.count({
        where: { status: { in: ["ACTIVO", "LICENCIA"] } },
      }),
      prisma.$queryRaw<
        { count: bigint }[]
      >`SELECT COUNT(*)::bigint AS count FROM "AdministrativeStaff" WHERE status IN ('ACTIVO','LICENCIA') AND EXTRACT(MONTH FROM "fechaNacimiento") = ${todayMes} AND "fechaNacimiento" >= '1940-01-01'`,
      prisma.staffDesignation.count({
        where: { OR: [{ fechaCese: null }, { fechaCese: { gte: new Date() } }] },
      }),
    ]);
  const counts: Counts = {
    cas: casCount,
    vigentes: vigentesCount,
    cumpleEsteMes: Number(cumpleEsteMes[0]?.count ?? 0),
    totalConOficina: vigentesCount,
    designacionesActivas,
  };

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", margin: 0 }}>
          Reportes
        </h1>
        <p style={{ color: "var(--text-faint)", fontSize: 14, marginTop: 4, marginBottom: 0 }}>
          Generación y descarga de reportes de personal administrativo UNAMAD. Cada reporte
          tiene su propia vista con filtros y preview antes de la descarga.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: 16,
        }}
      >
        {REPORTS.map((r) => (
          <Link
            key={r.key}
            href={r.href}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 18,
              textDecoration: "none",
              color: "var(--text)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              transition: "transform 0.1s, box-shadow 0.1s",
            }}
            className="report-card"
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  background: r.bg,
                  color: r.fg,
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <r.Icon size={22} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                  {r.title}
                </div>
                <div style={{ fontSize: 12, color: r.fg, fontWeight: 600, marginTop: 2 }}>
                  {r.stat(counts)}
                </div>
              </div>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "var(--text-faint)",
                lineHeight: 1.5,
                marginTop: 4,
              }}
            >
              {r.description}
            </p>
            <div
              style={{
                marginTop: "auto",
                paddingTop: 8,
                fontSize: 13,
                color: r.fg,
                fontWeight: 600,
              }}
            >
              Abrir reporte →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
