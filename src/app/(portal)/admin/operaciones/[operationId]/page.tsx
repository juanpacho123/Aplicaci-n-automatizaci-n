import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page";
import { Alert } from "@/components/ui/alert";
import { OperationDetailView } from "@/components/shared/operation-detail";
import { requirePageAuth } from "@/lib/authz/guards";
import { isAppError } from "@/lib/http/errors";
import { operationDetail } from "@/lib/services/history.service";

export default async function AdminOperationPage({ params }: { params: Promise<{ operationId: string }> }) {
  const ctx = await requirePageAuth("history:read:all");
  const { operationId } = await params;
  let op: Awaited<ReturnType<typeof operationDetail>>;
  try {
    op = await operationDetail(ctx, operationId);
  } catch (err) {
    return <Alert tone="danger">{isAppError(err) ? err.message : "Error inesperado."}</Alert>;
  }
  return (
    <>
      <Link href="/admin/operaciones" className="mb-2 inline-flex items-center gap-1 text-[0.8125rem] text-ink-600 hover:text-ink-900">
        <ChevronLeft className="size-4" aria-hidden /> Historial de operaciones
      </Link>
      <PageHeader title="Operación de carga" description={`${op.user.fullName} · ${op.project.code} · ${op.stage}`} />
      <OperationDetailView op={op} />
    </>
  );
}
