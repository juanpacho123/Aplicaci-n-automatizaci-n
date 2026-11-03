import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page";
import { DocumentalExplorer } from "@/components/admin/documental-explorer";
import { requirePageAuth } from "@/lib/authz/guards";
import { db } from "@/lib/db/prisma";

export const metadata = { title: "Gestión documental" };

export default async function DocumentalPage() {
  await requirePageAuth("folder:rename");
  const projects = await db.project.findMany({ orderBy: { code: "asc" }, include: { locations: { include: { company: true } } } });
  return (
    <>
      <PageHeader title="Gestión documental" description="Árbol de carpetas por proyecto. Solo las carpetas adicionales pueden renombrarse o eliminarse; la estructura principal está protegida." />
      <Suspense>
        <DocumentalExplorer
          projects={projects.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            locations: p.locations.map((l) => ({ id: l.id, label: `${l.company ? l.company.name : "Compartida"} · ${l.rootPath}` })),
          }))}
        />
      </Suspense>
    </>
  );
}
