import { prisma } from "@/lib/prisma";
import { requireAuth } from "../../_lib/guard";
import { serializeIncident } from "../../_lib/incident-serializer";
import { fail, ok } from "../../_lib/response";

// GET /api/v1/incidents/:code
// Reporter only sees their own; admin (incidents.read) sees any.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const me = auth.user;

  const { code } = await params;
  const canReadAll = me.permissions.has("incidents.read");

  const incident = await prisma.incident.findUnique({
    where: { code },
    include: {
      category: true,
      reporter: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      attachments: true,
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true } } },
      },
    },
  });

  if (!incident) return fail("Incidente no encontrado.", 404);

  if (!canReadAll && incident.reporterId !== me.id) {
    return fail("No tienes acceso a este incidente.", 403);
  }

  return ok({
    incident: serializeIncident(incident, {
      includeInternalComments: canReadAll,
    }),
  });
}
