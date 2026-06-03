import { redirect } from "next/navigation";

// La vista combinada Indeterminado + Confianza se separó en dos módulos
// (/personal/indeterminado y /personal/confianza). Mantenemos esta ruta como
// redirect para no romper enlaces o marcadores antiguos.
export const dynamic = "force-dynamic";

export default function Page() {
  redirect("/personal/indeterminado");
}
