import { prisma } from "@/lib/prisma";
import { requireAuth } from "../_lib/guard";
import { ok } from "../_lib/response";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const categories = await prisma.incidentCategory.findMany({
    where: { active: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      icon: true,
    },
  });

  return ok({ categories });
}
