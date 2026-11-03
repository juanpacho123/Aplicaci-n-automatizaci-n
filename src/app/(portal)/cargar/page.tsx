import { Suspense } from "react";
import { PageHeader } from "@/components/ui/page";
import { EmptyState } from "@/components/ui/feedback";
import { UploadWorkspace } from "@/components/upload/upload-workspace";
import { requirePageAuth } from "@/lib/authz/guards";
import { canReplace } from "@/lib/authz/policy";
import { listAccessibleProjects } from "@/lib/services/projects.service";
import { getSettings } from "@/lib/services/settings.service";
import { storageKind } from "@/lib/storage";
import { FolderX } from "lucide-react";

export const metadata = { title: "Carga de documentos" };

export default async function UploadPage() {
  const ctx = await requirePageAuth("document:upload");
  const [projects, settings] = await Promise.all([listAccessibleProjects(ctx), getSettings()]);
  const usable = projects.filter((p) => p.status === "ACTIVE");
  return (
    <>
      <PageHeader title="CARGA DE DOCUMENTOS" description="Seleccione el destino en SharePoint, arrastre los documentos y confirme la carga." />
      {usable.length === 0 ? (
        <EmptyState icon={<FolderX />} title="No tiene proyectos asignados" description="El administrador debe asignarle al menos un proyecto para que pueda cargar documentos." />
      ) : (
        <Suspense>
          <UploadWorkspace
            projects={usable.map((p) => ({ id: p.id, code: p.code, name: p.name, hasLocation: p.hasLocation, configuredStages: p.configuredStages, totalStages: p.totalStages }))}
            rules={{
              maxFileSizeMB: settings.uploads.maxFileSizeMB,
              allowedExtensions: settings.uploads.allowedExtensions,
              maxFilesPerOperation: settings.uploads.maxFilesPerOperation,
              chunkSizeKB: settings.uploads.chunkSizeKB,
              maxRetries: settings.uploads.maxRetries,
              parallelUploads: settings.uploads.parallelUploads,
            }}
            storage={storageKind()}
            canReplaceDefault={canReplace(ctx.role, settings.uploads.allowContractorReplace)}
          />
        </Suspense>
      )}
    </>
  );
}
