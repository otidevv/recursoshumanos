"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/server";
import type { PermissionKey } from "@/lib/auth/permissions";
import {
  CARGOS_BY_CODE,
  DEPENDENCIAS_BY_CODE,
  TIPOS_DISCAPACIDAD_BY_CODE,
  SEXOS_BY_CODE,
  REGIMENES_LABORAL_BY_CODE,
  VINCULOS_ACTUAL_BY_CODE,
} from "@/lib/sunedu/catalogs";
import {
  validateEmail,
  validateNumeroDocumento,
  validatePais,
  validateStaffConditionals,
  validateUbigeo,
} from "@/lib/sunedu/validation";
import type {
  ActionResult,
  StaffCeseMotivo,
  StaffInput,
  StaffStatus,
  VinculoInput,
  WorkplaceInput,
} from "./types";
import { CESE_STATUSES, STAFF_CESE_MOTIVOS, STAFF_STATUSES } from "./types";

const NAME_MIN = 2;
const NAME_MAX = 80;

class Denied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Denied";
  }
}

async function authorize(perm: PermissionKey): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new Denied("No autenticado.");
  if (!u.permissions.has(perm))
    throw new Denied("No tienes permisos para esta acción.");
  return u;
}

function fail(error: string, fieldErrors?: Record<string, string>): ActionResult {
  return { ok: false, error, fieldErrors };
}
function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}
function refresh() {
  revalidatePath("/personal");
}

function parseDate(value: string, field: string): Date | string {
  // Accept YYYY-MM-DD (HTML date input) — return Date a 12:00 UTC del mismo
  // día (date-only intent: evita TZ shifts en cualquier proceso/browser).
  if (!value) return `${field}: fecha requerida.`;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return `${field}: formato debe ser AAAA-MM-DD.`;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const d = new Date(Date.UTC(y, mo - 1, da, 12, 0, 0));
  if (
    d.getUTCFullYear() !== y ||
    d.getUTCMonth() !== mo - 1 ||
    d.getUTCDate() !== da
  ) {
    return `${field}: fecha inexistente.`;
  }
  return d;
}

function bound(value: string, min: number, max: number): string | null {
  const trimmed = value.trim();
  if (trimmed.length < min) return `Mínimo ${min} caracteres.`;
  if (trimmed.length > max) return `Máximo ${max} caracteres.`;
  return null;
}

function validateStaffFields(
  input: StaffInput,
): { ok: true; data: ValidatedStaff } | { ok: false; result: ActionResult } {
  const fieldErrors: Record<string, string> = {};

  if (!CARGOS_BY_CODE.has(input.cargoCode))
    fieldErrors.cargoCode = "Cargo inválido.";
  if (!DEPENDENCIAS_BY_CODE.has(input.dependenciaCode))
    fieldErrors.dependenciaCode = "Dependencia inválida.";
  if (!SEXOS_BY_CODE.has(input.sexoCode))
    fieldErrors.sexoCode = "Sexo inválido.";

  const docErr = validateNumeroDocumento(
    input.tipoDocumentoCode,
    input.numeroDocumento,
  );
  if (docErr) fieldErrors.numeroDocumento = docErr;

  const nameErr =
    bound(input.nombres, NAME_MIN, NAME_MAX) ??
    (!/^[A-Za-zÀ-ÿ\s'-]+$/.test(input.nombres.trim())
      ? "Solo letras y espacios."
      : null);
  if (nameErr) fieldErrors.nombres = nameErr;

  const ap1Err = bound(input.primerApellido, NAME_MIN, NAME_MAX);
  if (ap1Err) fieldErrors.primerApellido = ap1Err;
  if (input.segundoApellido.trim()) {
    const ap2Err = bound(input.segundoApellido, NAME_MIN, NAME_MAX);
    if (ap2Err) fieldErrors.segundoApellido = ap2Err;
  }

  if (input.tipoDiscapacidadCode != null) {
    if (!TIPOS_DISCAPACIDAD_BY_CODE.has(input.tipoDiscapacidadCode))
      fieldErrors.tipoDiscapacidadCode = "Tipo de discapacidad inválido.";
  }

  const paisErr = validatePais(input.paisNacimientoCode);
  if (paisErr) fieldErrors.paisNacimientoCode = paisErr;

  if (input.ubigeoNacimiento) {
    const e = validateUbigeo(input.ubigeoNacimiento);
    if (e) fieldErrors.ubigeoNacimiento = e;
  }
  const ubiDomErr = validateUbigeo(input.ubigeoDomicilio);
  if (ubiDomErr) fieldErrors.ubigeoDomicilio = ubiDomErr;

  const emailInst = validateEmail(input.correoInstitucional);
  if (emailInst) fieldErrors.correoInstitucional = emailInst;
  const emailPers = validateEmail(input.correoPersonal);
  if (emailPers) fieldErrors.correoPersonal = emailPers;

  const ingreso = parseDate(input.fechaIngresoIE, "Fecha ingreso");
  if (typeof ingreso === "string") fieldErrors.fechaIngresoIE = ingreso;
  const nacimiento = parseDate(input.fechaNacimiento, "Fecha nacimiento");
  if (typeof nacimiento === "string") fieldErrors.fechaNacimiento = nacimiento;

  const cond = validateStaffConditionals({
    unSoloApellido: input.unSoloApellido,
    segundoApellido: input.segundoApellido,
    condicionDiscapacidad: input.condicionDiscapacidad,
    tipoDiscapacidadCode: input.tipoDiscapacidadCode,
    paisNacimientoCode: input.paisNacimientoCode,
    ubigeoNacimiento: input.ubigeoNacimiento,
  });
  Object.assign(fieldErrors, cond);

  // Cese / baja: solo se exige (y se guarda) cuando el trabajador queda en un
  // estado de baja (PASIVO/FALLECIMIENTO). En ACTIVO/LICENCIA se limpia.
  const isCese = (CESE_STATUSES as readonly string[]).includes(input.status);
  let fechaCese: Date | null = null;
  let motivoCese: StaffCeseMotivo | null = null;
  let documentoCese: string | null = null;
  if (isCese) {
    const fc = parseDate(input.fechaCese, "Fecha de cese");
    if (typeof fc === "string") fieldErrors.fechaCese = fc;
    else fechaCese = fc;
    if (!input.motivoCese) {
      fieldErrors.motivoCese = "Indica el motivo del cese.";
    } else if (
      !(STAFF_CESE_MOTIVOS as readonly string[]).includes(input.motivoCese)
    ) {
      fieldErrors.motivoCese = "Motivo de cese inválido.";
    } else {
      motivoCese = input.motivoCese;
    }
    documentoCese = input.documentoCese.trim() || null;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, result: fail("Revisa los campos marcados.", fieldErrors) };
  }

  return {
    ok: true,
    data: {
      cargoCode: input.cargoCode,
      dependenciaCode: input.dependenciaCode,
      fechaIngresoIE: ingreso as Date,
      tipoDocumentoCode: input.tipoDocumentoCode,
      numeroDocumento: input.numeroDocumento.trim().toUpperCase(),
      nombres: input.nombres.trim(),
      primerApellido: input.primerApellido.trim().toUpperCase(),
      segundoApellido: input.segundoApellido.trim()
        ? input.segundoApellido.trim().toUpperCase()
        : null,
      apellidoCasada: input.apellidoCasada.trim()
        ? input.apellidoCasada.trim().toUpperCase()
        : null,
      unSoloApellido: input.unSoloApellido,
      condicionDiscapacidad: input.condicionDiscapacidad,
      tipoDiscapacidadCode: input.condicionDiscapacidad
        ? input.tipoDiscapacidadCode
        : null,
      sexoCode: input.sexoCode,
      fechaNacimiento: nacimiento as Date,
      paisNacimientoCode: input.paisNacimientoCode,
      ubigeoNacimiento: input.ubigeoNacimiento.trim() || null,
      ubigeoDomicilio: input.ubigeoDomicilio.trim(),
      correoInstitucional: input.correoInstitucional.trim().toLowerCase() || null,
      correoPersonal: input.correoPersonal.trim().toLowerCase() || null,
      telefono: input.telefono.trim() || null,
      celular: input.celular.trim() || null,
      gradoMaximo: input.gradoMaximo.trim() || null,
      grupoCarrera: input.grupoCarrera.trim() || null,
      carreraEgresado: input.carreraEgresado.trim() || null,
      puestoDetallado: input.puestoDetallado.trim() || null,
      plazaOrigen: input.plazaOrigen.trim() || null,
      plazaActual: input.plazaActual.trim() || null,
      status: (STAFF_STATUSES as readonly string[]).includes(input.status)
        ? input.status
        : "ACTIVO",
      fechaCese,
      motivoCese,
      documentoCese,
    },
  };
}

type ValidatedStaff = {
  cargoCode: number;
  dependenciaCode: number;
  fechaIngresoIE: Date;
  tipoDocumentoCode: number;
  numeroDocumento: string;
  nombres: string;
  primerApellido: string;
  segundoApellido: string | null;
  apellidoCasada: string | null;
  unSoloApellido: boolean;
  condicionDiscapacidad: boolean;
  tipoDiscapacidadCode: number | null;
  sexoCode: number;
  fechaNacimiento: Date;
  paisNacimientoCode: string;
  ubigeoNacimiento: string | null;
  ubigeoDomicilio: string;
  correoInstitucional: string | null;
  correoPersonal: string | null;
  telefono: string | null;
  celular: string | null;
  gradoMaximo: string | null;
  grupoCarrera: string | null;
  carreraEgresado: string | null;
  puestoDetallado: string | null;
  plazaOrigen: string | null;
  plazaActual: string | null;
  status: StaffStatus;
  fechaCese: Date | null;
  motivoCese: StaffCeseMotivo | null;
  documentoCese: string | null;
};

const VALID_CONDICIONES = new Set(["DETERMINADO", "INDETERMINADO", "CONFIANZA"]);

function validateVinculoInput(v: VinculoInput): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!REGIMENES_LABORAL_BY_CODE.has(v.regimenLaboralCode))
    errs.regimenLaboralCode = "Régimen inválido.";
  if (!VINCULOS_ACTUAL_BY_CODE.has(v.vinculoActualCode))
    errs.vinculoActualCode = "Vínculo actual inválido.";
  const ini = parseDate(v.fechaInicio, "Fecha inicio");
  if (typeof ini === "string") errs.fechaInicio = ini;
  // Para DETERMINADO la fecha de término es obligatoria.
  // Para INDETERMINADO/CONFIANZA puede ir vacía.
  const isIndefinite =
    v.condicionContrato === "INDETERMINADO" ||
    v.condicionContrato === "CONFIANZA";
  if (v.fechaTermino) {
    const term = parseDate(v.fechaTermino, "Fecha término");
    if (typeof term === "string") errs.fechaTermino = term;
    else if (typeof ini !== "string" && term < ini)
      errs.fechaTermino = "Debe ser posterior a fecha inicio.";
  } else if (!isIndefinite && v.vinculoActualCode !== 1) {
    errs.fechaTermino = "Requerida cuando el vínculo no es actual.";
  } else if (v.condicionContrato === "DETERMINADO" && !v.fechaTermino) {
    errs.fechaTermino =
      "Requerida en contratos determinados (DETERMINADO).";
  }
  if (v.condicionContrato && !VALID_CONDICIONES.has(v.condicionContrato)) {
    errs.condicionContrato = "Condición inválida.";
  }
  return errs;
}

function validateWorkplaceInput(w: WorkplaceInput): Record<string, string> {
  const errs: Record<string, string> = {};
  if (w.otroLocal) {
    const u = validateUbigeo(w.ubigeoLocal);
    if (u) errs.ubigeoLocal = u;
    if (!w.direccion.trim()) errs.direccion = "Dirección requerida.";
    else if (w.direccion.trim().length > 200)
      errs.direccion = "Máximo 200 caracteres.";
  } else {
    if (!w.localId) errs.localId = "Selecciona una sede UNAMAD.";
  }
  return errs;
}

// ─────────────────────────── CRUD ───────────────────────────

export async function createStaff(
  input: StaffInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await authorize("staff.write");
    const v = validateStaffFields(input);
    if (!v.ok) return v.result;

    // Initial vinculo + workplace are required at creation.
    const subErrors: Record<string, string> = {};
    for (const [k, val] of Object.entries(validateVinculoInput(input.vinculo))) {
      subErrors[`vinculo.${k}`] = val;
    }
    for (const [k, val] of Object.entries(
      validateWorkplaceInput(input.workplace),
    )) {
      subErrors[`workplace.${k}`] = val;
    }
    if (Object.keys(subErrors).length > 0) {
      return fail("Revisa el vínculo y el lugar de trabajo.", subErrors);
    }

    const dup = await prisma.administrativeStaff.findUnique({
      where: {
        tipoDocumentoCode_numeroDocumento: {
          tipoDocumentoCode: v.data.tipoDocumentoCode,
          numeroDocumento: v.data.numeroDocumento,
        },
      },
      select: { id: true },
    });
    if (dup)
      return fail("Ya existe un trabajador con ese documento.", {
        numeroDocumento: "Documento duplicado.",
      });

    // Validate workplace localId exists if not otroLocal
    if (!input.workplace.otroLocal) {
      const exists = await prisma.universityLocal.findUnique({
        where: { id: input.workplace.localId },
        select: { id: true, active: true },
      });
      if (!exists)
        return fail("La sede seleccionada no existe.", {
          "workplace.localId": "Sede no encontrada.",
        });
      if (!exists.active)
        return fail("La sede seleccionada está suspendida.", {
          "workplace.localId": "Sede inactiva.",
        });
    }

    const created = await prisma.$transaction(async (tx) => {
      const staff = await tx.administrativeStaff.create({
        data: { ...v.data, createdById: me.id },
        select: { id: true },
      });

      const vinIni = parseDate(input.vinculo.fechaInicio, "x") as Date;
      const vinTerm = input.vinculo.fechaTermino
        ? (parseDate(input.vinculo.fechaTermino, "x") as Date)
        : null;
      await tx.staffEmploymentLink.create({
        data: {
          staffId: staff.id,
          regimenLaboralCode: input.vinculo.regimenLaboralCode,
          vinculoActualCode: input.vinculo.vinculoActualCode,
          fechaInicio: vinIni,
          fechaTermino: vinTerm,
          condicionContrato: input.vinculo.condicionContrato || null,
          esAdenda: input.vinculo.esAdenda,
          year: vinIni.getFullYear(),
        },
      });

      await tx.staffWorkplace.create({
        data: {
          staffId: staff.id,
          otroLocal: input.workplace.otroLocal,
          localId: input.workplace.otroLocal ? null : input.workplace.localId,
          ubigeoLocal: input.workplace.otroLocal
            ? input.workplace.ubigeoLocal.trim()
            : null,
          direccion: input.workplace.otroLocal
            ? input.workplace.direccion.trim()
            : null,
        },
      });

      return staff;
    });

    refresh();
    return ok({ id: created.id });
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("createStaff failed:", e);
    return fail("No se pudo crear el trabajador.");
  }
}

export async function updateStaff(
  id: string,
  input: StaffInput,
): Promise<ActionResult> {
  try {
    await authorize("staff.write");
    const v = validateStaffFields(input);
    if (!v.ok) return v.result;

    const collision = await prisma.administrativeStaff.findFirst({
      where: {
        tipoDocumentoCode: v.data.tipoDocumentoCode,
        numeroDocumento: v.data.numeroDocumento,
        NOT: { id },
      },
      select: { id: true },
    });
    if (collision)
      return fail("Otro trabajador ya usa ese documento.", {
        numeroDocumento: "Documento duplicado.",
      });

    await prisma.administrativeStaff.update({
      where: { id },
      data: v.data,
    });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    console.error("updateStaff failed:", e);
    return fail("No se pudo actualizar el trabajador.");
  }
}

/**
 * Cambia el estado de un trabajador (y de paso gestiona los datos de cese).
 *
 * - Si `status` ∈ {PASIVO, FALLECIMIENTO} (CESE_STATUSES), `cese.fechaCese` y
 *   `cese.motivoCese` son OBLIGATORIOS (`documentoCese` opcional). Si faltan o
 *   son inválidos, retorna `fail(...)` con fieldErrors — no cambia nada.
 * - Si `status` ∈ {ACTIVO, LICENCIA}, los 3 campos de cese se limpian (null) y
 *   el parámetro `cese` se ignora.
 */
export async function setStaffStatus(
  id: string,
  status: StaffStatus,
  cese?: { fechaCese?: string; motivoCese?: string; documentoCese?: string },
): Promise<ActionResult> {
  try {
    await authorize("staff.write");
    if (!(STAFF_STATUSES as readonly string[]).includes(status)) {
      return fail("Estado inválido.");
    }

    // Si pasa a un estado de baja (PASIVO/FALLECIMIENTO) exigimos fecha+motivo;
    // si vuelve a ACTIVO/LICENCIA limpiamos los datos de cese.
    let fechaCese: Date | null = null;
    let motivoCese: StaffCeseMotivo | null = null;
    let documentoCese: string | null = null;
    if ((CESE_STATUSES as readonly string[]).includes(status)) {
      const fc = parseDate(cese?.fechaCese ?? "", "Fecha de cese");
      if (typeof fc === "string") {
        return fail(fc, { fechaCese: fc });
      }
      const motivo = cese?.motivoCese ?? "";
      if (!(STAFF_CESE_MOTIVOS as readonly string[]).includes(motivo)) {
        return fail("Indica un motivo de cese válido.", {
          motivoCese: "Motivo de cese inválido.",
        });
      }
      fechaCese = fc;
      motivoCese = motivo as StaffCeseMotivo;
      documentoCese = (cese?.documentoCese ?? "").trim() || null;
    }

    await prisma.administrativeStaff.update({
      where: { id },
      data: { status, fechaCese, motivoCese, documentoCese },
    });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    return fail("No se pudo cambiar el estado.");
  }
}

export async function deleteStaff(id: string): Promise<ActionResult> {
  try {
    await authorize("staff.write");
    await prisma.administrativeStaff.delete({ where: { id } });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    return fail("No se pudo eliminar el trabajador.");
  }
}

// ─────────────────────────── Vínculos ───────────────────────────

export async function addVinculo(
  staffId: string,
  input: VinculoInput,
): Promise<ActionResult> {
  try {
    await authorize("staff.write");
    const errs = validateVinculoInput(input);
    if (Object.keys(errs).length > 0)
      return fail("Datos inválidos.", errs);
    const ini = parseDate(input.fechaInicio, "x") as Date;
    await prisma.staffEmploymentLink.create({
      data: {
        staffId,
        regimenLaboralCode: input.regimenLaboralCode,
        vinculoActualCode: input.vinculoActualCode,
        fechaInicio: ini,
        fechaTermino: input.fechaTermino
          ? (parseDate(input.fechaTermino, "x") as Date)
          : null,
        condicionContrato: input.condicionContrato || null,
        esAdenda: input.esAdenda,
        year: ini.getFullYear(),
      },
    });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    return fail("No se pudo añadir el vínculo.");
  }
}

/**
 * Atajo para añadir una adenda al vínculo CAS de un trabajador.
 * Hereda régimen=4 (CAS), condición=DETERMINADO, marca esAdenda=true.
 * Además marca todos los vínculos previos del trabajador como
 * vinculoActualCode=2 (Ya no es el actual) y al nuevo como 1.
 */
export async function addAdenda(
  staffId: string,
  fechaInicio: string,
  fechaTermino: string,
): Promise<ActionResult> {
  try {
    await authorize("staff.write");
    const ini = parseDate(fechaInicio, "Fecha inicio");
    if (typeof ini === "string") return fail("Fecha inválida.", { fechaInicio: ini });
    const fin = parseDate(fechaTermino, "Fecha término");
    if (typeof fin === "string") return fail("Fecha inválida.", { fechaTermino: fin });
    if (fin < ini)
      return fail("Fecha término debe ser posterior a fecha inicio.", {
        fechaTermino: "Inválida",
      });

    await prisma.$transaction(async (tx) => {
      // Una adenda solo tiene sentido si existe al menos un contrato previo.
      const existing = await tx.staffEmploymentLink.count({
        where: { staffId },
      });
      if (existing === 0) {
        throw new Error(
          "El trabajador no tiene un contrato inicial registrado.",
        );
      }
      // Validamos no-solape con el vínculo más reciente.
      const previous = await tx.staffEmploymentLink.findFirst({
        where: { staffId },
        orderBy: { fechaInicio: "desc" },
        select: { fechaTermino: true, fechaInicio: true },
      });
      if (
        previous?.fechaTermino &&
        ini < previous.fechaTermino
      ) {
        throw new Error(
          `La adenda debe empezar después del término del vínculo anterior (${previous.fechaTermino.toISOString().slice(0, 10)}).`,
        );
      }
      // Marca cualquier vínculo previo como NO actual.
      await tx.staffEmploymentLink.updateMany({
        where: { staffId, vinculoActualCode: 1 },
        data: { vinculoActualCode: 2 },
      });
      await tx.staffEmploymentLink.create({
        data: {
          staffId,
          regimenLaboralCode: 4, // CAS
          vinculoActualCode: 1,  // Es el nuevo vínculo vigente
          fechaInicio: ini,
          fechaTermino: fin,
          condicionContrato: "DETERMINADO",
          esAdenda: true,
          year: ini.getFullYear(),
        },
      });
    });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    // Propaga el mensaje específico de validación interna.
    if (e instanceof Error && e.message) return fail(e.message);
    return fail("No se pudo añadir la adenda.");
  }
}

export async function deleteVinculo(id: string): Promise<ActionResult> {
  try {
    await authorize("staff.write");
    await prisma.staffEmploymentLink.delete({ where: { id } });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    return fail("No se pudo eliminar el vínculo.");
  }
}

// ─────────────────────────── Workplaces ───────────────────────────

export async function addWorkplace(
  staffId: string,
  input: WorkplaceInput,
): Promise<ActionResult> {
  try {
    await authorize("staff.write");
    const errs = validateWorkplaceInput(input);
    if (Object.keys(errs).length > 0)
      return fail("Datos inválidos.", errs);
    await prisma.staffWorkplace.create({
      data: {
        staffId,
        otroLocal: input.otroLocal,
        localId: input.otroLocal ? null : input.localId,
        ubigeoLocal: input.otroLocal ? input.ubigeoLocal.trim() : null,
        direccion: input.otroLocal ? input.direccion.trim() : null,
      },
    });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    return fail("No se pudo añadir el lugar de trabajo.");
  }
}

export async function deleteWorkplace(id: string): Promise<ActionResult> {
  try {
    await authorize("staff.write");
    await prisma.staffWorkplace.delete({ where: { id } });
    refresh();
    return ok();
  } catch (e) {
    if (e instanceof Denied) return fail(e.message);
    return fail("No se pudo eliminar el lugar de trabajo.");
  }
}
