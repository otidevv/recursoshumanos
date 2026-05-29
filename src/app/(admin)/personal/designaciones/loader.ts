import "server-only";
import { prisma } from "@/lib/prisma";
import type { DesignationRow, DesignationStatus } from "./types";

export async function loadDesignations(): Promise<DesignationRow[]> {
  const rows = await prisma.staffDesignation.findMany({
    orderBy: [{ fechaInicio: "desc" }],
  });

  const now = Date.now();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  return rows.map((d): DesignationRow => {
    const inicio = d.fechaInicio.getTime();
    const ceseMs = d.fechaCese?.getTime() ?? null;

    let status: DesignationStatus;
    if (ceseMs != null) {
      status = ceseMs <= now ? "FINALIZADA" : "VIGENTE";
    } else {
      status = d.notaFinCargo ? "INDEFINIDA" : "VIGENTE";
    }

    const fin = ceseMs && ceseMs <= now ? ceseMs : now;
    const duracionDias = Math.max(0, Math.floor((fin - inicio) / MS_PER_DAY));

    return {
      id: d.id,
      staffId: d.staffId,
      dni: d.dni,
      nombreCompleto: d.nombreCompleto,
      dependencia: d.dependencia,
      cargoDesempenado: d.cargoDesempenado,
      documentoDesignacion: d.documentoDesignacion,
      correo: d.correo,
      fechaInicio: d.fechaInicio.toISOString(),
      fechaCese: d.fechaCese?.toISOString() ?? null,
      notaFinCargo: d.notaFinCargo,
      status,
      duracionDias,
    };
  });
}
