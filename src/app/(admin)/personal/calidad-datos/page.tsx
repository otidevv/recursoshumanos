import { requirePermission } from "@/lib/auth/server";
import { loadQualityData } from "./loader";
import { QualityClient } from "./QualityClient";

export const metadata = { title: "Calidad de Datos · UNAMAD Admin" };
export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePermission("staff.read");
  const data = await loadQualityData();
  return <QualityClient data={data} />;
}
