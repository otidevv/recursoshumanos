import { requirePermission } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";
import { ResolucionesClient, type ResRow } from "./ResolucionesClient";

export const metadata = {
  title: "Reporte: Resoluciones de designación · UNAMAD",
};
export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("staff.read");

  const designations = await prisma.staffDesignation.findMany({
    orderBy: [{ fechaInicio: "desc" }],
  });

  const now = Date.now();
  const rows: ResRow[] = designations.map((d) => {
    let status: "VIGENTE" | "INDEFINIDA" | "FINALIZADA";
    if (d.fechaCese != null) {
      status = d.fechaCese.getTime() > now ? "VIGENTE" : "FINALIZADA";
    } else {
      status = d.notaFinCargo ? "INDEFINIDA" : "VIGENTE";
    }
    return {
      id: d.id,
      nombre: d.nombreCompleto,
      dni: d.dni,
      cargo: d.cargoDesempenado,
      dependencia: d.dependencia,
      documentoDesignacion: d.documentoDesignacion ?? "",
      correo: d.correo ?? "",
      fechaInicio: d.fechaInicio.toISOString(),
      fechaCese: d.fechaCese?.toISOString() ?? null,
      notaFinCargo: d.notaFinCargo,
      status,
      year: d.fechaInicio.getUTCFullYear(),
    };
  });

  return <ResolucionesClient rows={rows} />;
}
