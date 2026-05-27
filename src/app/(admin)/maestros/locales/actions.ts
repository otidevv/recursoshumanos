"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import { ubigeoByCodeStrict } from "@/lib/sunedu";
import type { ActionResult, LocalInput } from "./types";

const CODE_RE = /^[A-Z]{1,2}\d{2,4}$/; // e.g. SL01, F001
const NAME_MIN = 3;
const NAME_MAX = 120;
const DIRECCION_MIN = 5;
const DIRECCION_MAX = 200;
const SEDE_FILIAL_VALUES = new Set(["S", "F"]);

class Denied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Denied";
  }
}

async function authorize(perm: PermissionKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Denied("No autenticado.");
  if (!user.permissions.has(perm)) {
    throw new Denied("No tienes permisos para esta acción.");
  }
  return user;
}

function fail(
  error: string,
  fieldErrors?: Record<string, string>,
): ActionResult {
  return { ok: false, error, fieldErrors };
}

function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

function refresh() {
  revalidatePath("/maestros/locales");
}

function validateInput(
  input: LocalInput,
): { ok: true; clean: LocalInput } | { ok: false; result: ActionResult } {
  const code = (input.code ?? "").trim().toUpperCase();
  const name = (input.name ?? "").trim();
  const sedeFilial = (input.sedeFilial ?? "").trim().toUpperCase();
  const ubigeoCode = (input.ubigeoCode ?? "").trim();
  const direccion = (input.direccion ?? "").trim();
  const tipoAutorizacion = (input.tipoAutorizacion ?? "").trim();

  const fieldErrors: Record<string, string> = {};

  if (!CODE_RE.test(code)) {
    fieldErrors.code = "Formato esperado: 2 letras + 2-4 dígitos (ej. SL01).";
  }
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    fieldErrors.name = `Entre ${NAME_MIN} y ${NAME_MAX} caracteres.`;
  }
  if (!SEDE_FILIAL_VALUES.has(sedeFilial)) {
    fieldErrors.sedeFilial = "Debe ser S (sede) o F (filial).";
  }
  if (!/^\d{6}$/.test(ubigeoCode) || !ubigeoByCodeStrict(ubigeoCode)) {
    fieldErrors.ubigeoCode = "Ubigeo inválido o no encontrado.";
  }
  if (direccion.length < DIRECCION_MIN || direccion.length > DIRECCION_MAX) {
    fieldErrors.direccion = `Entre ${DIRECCION_MIN} y ${DIRECCION_MAX} caracteres.`;
  }
  if (tipoAutorizacion.length > 120) {
    fieldErrors.tipoAutorizacion = "Máximo 120 caracteres.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, result: fail("Datos inválidos.", fieldErrors) };
  }

  return {
    ok: true,
    clean: {
      code,
      name,
      sedeFilial,
      ubigeoCode,
      direccion,
      tipoAutorizacion,
    },
  };
}

export async function createLocal(
  input: LocalInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await authorize("locales.write");
    const v = validateInput(input);
    if (!v.ok) return v.result;

    const exists = await prisma.universityLocal.findUnique({
      where: { code: v.clean.code },
      select: { id: true },
    });
    if (exists) {
      return fail("Ya existe una sede con ese código.", {
        code: "Código duplicado.",
      });
    }

    const created = await prisma.universityLocal.create({
      data: {
        code: v.clean.code,
        name: v.clean.name,
        sedeFilial: v.clean.sedeFilial,
        ubigeoCode: v.clean.ubigeoCode,
        direccion: v.clean.direccion,
        tipoAutorizacion: v.clean.tipoAutorizacion || null,
      },
      select: { id: true },
    });
    refresh();
    return ok({ id: created.id });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    return fail("No se pudo crear la sede.");
  }
}

export async function updateLocal(
  id: string,
  input: LocalInput,
): Promise<ActionResult> {
  try {
    await authorize("locales.write");
    const v = validateInput(input);
    if (!v.ok) return v.result;

    const collision = await prisma.universityLocal.findFirst({
      where: { code: v.clean.code, NOT: { id } },
      select: { id: true },
    });
    if (collision) {
      return fail("Otra sede ya usa ese código.", {
        code: "Código duplicado.",
      });
    }

    await prisma.universityLocal.update({
      where: { id },
      data: {
        code: v.clean.code,
        name: v.clean.name,
        sedeFilial: v.clean.sedeFilial,
        ubigeoCode: v.clean.ubigeoCode,
        direccion: v.clean.direccion,
        tipoAutorizacion: v.clean.tipoAutorizacion || null,
      },
    });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    return fail("No se pudo actualizar la sede.");
  }
}

export async function setLocalActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    await authorize("locales.write");
    await prisma.universityLocal.update({
      where: { id },
      data: { active },
    });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    return fail("No se pudo cambiar el estado.");
  }
}

export async function deleteLocal(id: string): Promise<ActionResult> {
  try {
    await authorize("locales.write");
    const inUse = await prisma.staffWorkplace.count({
      where: { localId: id },
    });
    if (inUse > 0) {
      return fail(
        `La sede está asignada a ${inUse} trabajador(es). Suspéndela en lugar de eliminarla.`,
      );
    }
    await prisma.universityLocal.delete({ where: { id } });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    return fail("No se pudo eliminar la sede.");
  }
}
