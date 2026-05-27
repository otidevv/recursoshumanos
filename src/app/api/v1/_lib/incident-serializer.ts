import type {
  Incident,
  IncidentAttachment,
  IncidentCategory,
  IncidentComment,
  User,
} from "@/generated/prisma/client";

type WithRelations = Incident & {
  category: Pick<IncidentCategory, "id" | "key" | "name" | "icon"> | null;
  reporter?: Pick<User, "id" | "name" | "email"> | null;
  assignedTo?: Pick<User, "id" | "name" | "email"> | null;
  attachments?: IncidentAttachment[];
  comments?: (IncidentComment & {
    author: Pick<User, "id" | "name"> | null;
  })[];
};

export function serializeIncident(i: WithRelations, opts?: { includeInternalComments?: boolean }) {
  return {
    id: i.id,
    code: i.code,
    title: i.title,
    description: i.description,
    status: i.status,
    severity: i.severity,
    category: i.category
      ? {
          id: i.category.id,
          key: i.category.key,
          name: i.category.name,
          icon: i.category.icon,
        }
      : null,
    lat: i.lat,
    lng: i.lng,
    locationText: i.locationText,
    reporter: i.reporter
      ? { id: i.reporter.id, name: i.reporter.name, email: i.reporter.email }
      : null,
    assignedTo: i.assignedTo
      ? {
          id: i.assignedTo.id,
          name: i.assignedTo.name,
          email: i.assignedTo.email,
        }
      : null,
    attachments:
      i.attachments?.map((a) => ({
        id: a.id,
        url: a.url,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        createdAt: a.createdAt.toISOString(),
      })) ?? [],
    comments:
      i.comments
        ?.filter((c) => opts?.includeInternalComments || !c.internal)
        .map((c) => ({
          id: c.id,
          body: c.body,
          internal: c.internal,
          author: c.author ? { id: c.author.id, name: c.author.name } : null,
          createdAt: c.createdAt.toISOString(),
        })) ?? [],
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
  };
}
