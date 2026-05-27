import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../_lib/guard";
import { generateIncidentCode } from "../_lib/incident-code";
import { serializeIncident } from "../_lib/incident-serializer";
import { fail, ok } from "../_lib/response";

const TITLE_MIN = 4;
const TITLE_MAX = 140;
const DESC_MIN = 10;
const DESC_MAX = 4000;
const SEVERITIES = ["low", "medium", "high", "critical"] as const;
type Severity = (typeof SEVERITIES)[number];

// POST /api/v1/incidents — crea un incidente.
export async function POST(request: Request) {
  const auth = await requirePermission("incidents.create");
  if (!auth.ok) return auth.response;
  const me = auth.user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Solicitud inválida.", 400);
  }
  if (typeof body !== "object" || body === null) {
    return fail("Solicitud inválida.", 400);
  }
  const input = body as Record<string, unknown>;

  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  const categoryKey =
    typeof input.categoryKey === "string" ? input.categoryKey : null;
  const severity: Severity = SEVERITIES.includes(input.severity as Severity)
    ? (input.severity as Severity)
    : "medium";
  const lat = typeof input.lat === "number" && isFinite(input.lat) ? input.lat : null;
  const lng = typeof input.lng === "number" && isFinite(input.lng) ? input.lng : null;
  const locationText =
    typeof input.locationText === "string"
      ? input.locationText.trim().slice(0, 200)
      : null;
  const attachmentUrls = Array.isArray(input.attachmentUrls)
    ? (input.attachmentUrls as unknown[]).filter(
        (u): u is { url: string; mimeType: string; sizeBytes?: number } =>
          typeof u === "object" &&
          u !== null &&
          typeof (u as { url?: unknown }).url === "string" &&
          typeof (u as { mimeType?: unknown }).mimeType === "string",
      )
    : [];

  const fieldErrors: Record<string, string> = {};
  if (title.length < TITLE_MIN)
    fieldErrors.title = `Mínimo ${TITLE_MIN} caracteres.`;
  else if (title.length > TITLE_MAX)
    fieldErrors.title = `Máximo ${TITLE_MAX} caracteres.`;
  if (description.length < DESC_MIN)
    fieldErrors.description = `Mínimo ${DESC_MIN} caracteres.`;
  else if (description.length > DESC_MAX)
    fieldErrors.description = `Máximo ${DESC_MAX} caracteres.`;
  if (!categoryKey) fieldErrors.categoryKey = "Categoría requerida.";
  if ((lat !== null) !== (lng !== null)) {
    fieldErrors.lat = "Latitud y longitud deben enviarse juntas.";
  }
  if (lat !== null && (lat < -90 || lat > 90))
    fieldErrors.lat = "Latitud fuera de rango.";
  if (lng !== null && (lng < -180 || lng > 180))
    fieldErrors.lng = "Longitud fuera de rango.";

  if (Object.keys(fieldErrors).length > 0) {
    return fail("Revisa los campos marcados.", 400, fieldErrors);
  }

  const category = await prisma.incidentCategory.findUnique({
    where: { key: categoryKey! },
  });
  if (!category || !category.active) {
    return fail("Categoría no válida.", 400, {
      categoryKey: "Categoría no encontrada.",
    });
  }

  // Code generation with retry on unique-violation (1 collision in 1B is fine
  // but we still defend against it).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateIncidentCode();
    try {
      const created = await prisma.incident.create({
        data: {
          code,
          title,
          description,
          severity,
          categoryId: category.id,
          reporterId: me.id,
          lat,
          lng,
          locationText,
          attachments:
            attachmentUrls.length > 0
              ? {
                  create: attachmentUrls.map((a) => ({
                    url: a.url,
                    mimeType: a.mimeType,
                    sizeBytes:
                      typeof a.sizeBytes === "number" ? a.sizeBytes : null,
                    uploadedById: me.id,
                  })),
                }
              : undefined,
        },
        include: {
          category: true,
          reporter: { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
          attachments: true,
        },
      });
      return ok({ incident: serializeIncident(created) }, 201);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        // code collision; retry
        continue;
      }
      console.error("POST /api/v1/incidents", e);
      return fail("No se pudo crear el incidente.", 500);
    }
  }

  return fail("No se pudo generar un código único. Intenta de nuevo.", 500);
}
