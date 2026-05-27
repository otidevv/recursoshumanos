import { prisma } from "@/lib/prisma";
import { requireAuth } from "../../_lib/guard";
import { serializeIncident } from "../../_lib/incident-serializer";
import { ok } from "../../_lib/response";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 30;

// GET /api/v1/incidents/mine?status=open&limit=30&cursor=…
export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const me = auth.user;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(
    Number(url.searchParams.get("limit")) || DEFAULT_LIMIT,
    MAX_LIMIT,
  );
  const cursor = url.searchParams.get("cursor"); // incident id

  const where = {
    reporterId: me.id,
    ...(status ? { status: status as never } : {}),
  };

  const items = await prisma.incident.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      category: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      attachments: true,
    },
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  return ok({
    incidents: page.map((i) => serializeIncident(i)),
    nextCursor,
  });
}
