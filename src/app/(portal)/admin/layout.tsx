import { requirePageAuth } from "@/lib/authz/guards";

/** Todo el árbol /admin exige el permiso administrativo (verificado en el servidor). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePageAuth("admin:access");
  return children;
}
