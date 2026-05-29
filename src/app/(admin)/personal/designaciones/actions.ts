"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/server";
import type { DesignationActionResult, DesignationInput } from "./types";

class Denied extends Error {
  constructor() {
    super("No autorizado");
  }
}

async function authorize() {
  try {
    await requirePermission("staff.write");
  } catch {
    throw new Denied();
  }
}

function refresh() {
  revalidatePath("/personal/designaciones");
}

function parseDate(value: string, field: string): Date | string {
  if (!value) return `${field}: fecha requerida.`;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return `${field}: formato AAAA-MM-DD.`;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const d = new Date(Date.UTC(y, mo - 1, da, 12, 0, 0));
  if (
    d.getUTCFullYear() !== y ||
    d.getUTCMonth() !== mo - 1 ||
    d.getUTCDate() !== da
  )
    return `${field}: fecha inexistente.`;
  return d;
}

function validate(
  input: DesignationInput,
):
  | {
      ok: true;
      data: {
        staffId: string | null;
        dni: string;
        nombreCompleto: string;
        dependencia: string;
        cargoDesempenado: string;
        documentoDesignacion: string | null;
        correo: string | null;
        fechaInicio: Date;
        fechaCese: Date | null;
        notaFinCargo: string | null;
      };
    }
  | { ok: false; result: DesignationActionResult } {
  const fieldErrors: Partial<Record<string, string>> = {};

  const dni = input.dni.trim();
  if (!/^\d{8}$/.test(dni)) fieldErrors.dni = "DNI debe tener 8 dígitos.";

  const nombreCompleto = input.nombreCompleto.trim();
  if (!nombreCompleto || nombreCompleto.length > 200)
    fieldErrors.nombreCompleto = "Nombre requerido (máx 200).";

  const dependencia = input.dependencia.trim();
  if (!dependencia || dependencia.length > 200)
    fieldErrors.dependencia = "Dependencia requerida (máx 200).";

  const cargoDesempenado = input.cargoDesempenado.trim();
  if (!cargoDesempenado || cargoDesempenado.length > 200)
    fieldErrors.cargoDesempenado = "Cargo requerido (máx 200).";

  const documentoDesignacion = input.documentoDesignacion.trim() || null;
  const correo = input.correo.trim() || null;
  if (correo && !/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(correo))
    fieldErrors.correo = "Correo inválido.";

  const fechaInicioParsed = parseDate(input.fechaInicio, "Fecha de inicio");
  if (typeof fechaInicioParsed === "string") {
    fieldErrors.fechaInicio = fechaInicioParsed;
  }

  let fechaCese: Date | null = null;
  if (input.fechaCese.trim()) {
    const fc = parseDate(input.fechaCese, "Fecha de cese");
    if (typeof fc === "string") fieldErrors.fechaCese = fc;
    else fechaCese = fc;
  }

  if (
    typeof fechaInicioParsed !== "string" &&
    fechaCese &&
    fechaCese < fechaInicioParsed
  ) {
    fieldErrors.fechaCese = "Fecha de cese debe ser posterior al inicio.";
  }

  const notaFinCargo = input.notaFinCargo.trim() || null;
  if (notaFinCargo && notaFinCargo.length > 300)
    fieldErrors.notaFinCargo = "Máx 300 caracteres.";

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      result: {
        ok: false,
        error: "Hay errores en los campos.",
        fieldErrors,
      },
    };
  }

  return {
    ok: true,
    data: {
      staffId: input.staffId,
      dni,
      nombreCompleto,
      dependencia,
      cargoDesempenado,
      documentoDesignacion,
      correo,
      fechaInicio: fechaInicioParsed as Date,
      fechaCese,
      notaFinCargo,
    },
  };
}

export async function createDesignation(
  input: DesignationInput,
): Promise<DesignationActionResult<{ id: string }>> {
  try {
    await authorize();
  } catch {
    return { ok: false, error: "No autorizado." };
  }

  const v = validate(input);
  if (!v.ok) return v.result as DesignationActionResult<{ id: string }>;

  // Auto-link a Personal por DNI si existe.
  if (!v.data.staffId) {
    const found = await prisma.administrativeStaff.findFirst({
      where: { numeroDocumento: v.data.dni, tipoDocumentoCode: 1 },
      select: { id: true },
    });
    v.data.staffId = found?.id ?? null;
  }

  const created = await prisma.staffDesignation.create({
    data: v.data,
    select: { id: true },
  });
  refresh();
  return { ok: true, data: { id: created.id } };
}

export async function updateDesignation(
  id: string,
  input: DesignationInput,
): Promise<DesignationActionResult<void>> {
  try {
    await authorize();
  } catch {
    return { ok: false, error: "No autorizado." };
  }

  const v = validate(input);
  if (!v.ok) return v.result as DesignationActionResult<void>;

  if (!v.data.staffId) {
    const found = await prisma.administrativeStaff.findFirst({
      where: { numeroDocumento: v.data.dni, tipoDocumentoCode: 1 },
      select: { id: true },
    });
    v.data.staffId = found?.id ?? null;
  }

  await prisma.staffDesignation.update({
    where: { id },
    data: v.data,
  });
  refresh();
  return { ok: true, data: undefined };
}

export async function deleteDesignation(
  id: string,
): Promise<DesignationActionResult<void>> {
  try {
    await authorize();
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  await prisma.staffDesignation.delete({ where: { id } });
  refresh();
  return { ok: true, data: undefined };
}
