import { Badge } from "@/components/ui/badge";

type Tone = "neutral" | "brand" | "info" | "success" | "warning" | "danger";
const MAPS: Record<string, Record<string, [string, Tone]>> = {
  user: {
    PENDING_APPROVAL: ["Pendiente de aprobación", "warning"],
    INVITATION_SENT: ["Invitación enviada", "info"],
    ACTIVE: ["Activo", "success"],
    SUSPENDED: ["Suspendido", "danger"],
    REJECTED: ["Rechazado", "neutral"],
  },
  file: {
    PENDING: ["Pendiente", "neutral"],
    IN_PROGRESS: ["En proceso", "info"],
    SUCCESS: ["Cargado correctamente", "success"],
    ERROR: ["Error", "danger"],
    CANCELLED: ["Cancelado", "neutral"],
  },
  operation: {
    PENDING: ["Pendiente", "neutral"],
    IN_PROGRESS: ["En proceso", "info"],
    COMPLETED: ["Completada", "success"],
    PARTIAL: ["Parcial", "warning"],
    FAILED: ["Fallida", "danger"],
    CANCELLED: ["Cancelada", "neutral"],
  },
  request: {
    PENDING: ["Pendiente", "warning"],
    INFO_REQUESTED: ["Información solicitada", "info"],
    APPROVED: ["Aprobada", "success"],
    REJECTED: ["Rechazada", "neutral"],
  },
  audit: { SUCCESS: ["Correcto", "success"], FAILURE: ["Error", "danger"], DENIED: ["Denegado", "warning"] },
  project: { ACTIVE: ["Activo", "success"], ARCHIVED: ["Archivado", "neutral"] },
  invitation: { SENT: ["Enviada", "info"], FAILED: ["Fallida", "danger"], REDEEMED: ["Aceptada", "success"] },
};

export const ROLE_LABEL: Record<string, string> = { ADMIN: "Administrador", CONTRACTOR: "Contratista", VIEWER: "Consulta" };

export function statusLabel(kind: keyof typeof MAPS, value: string) {
  return MAPS[kind]?.[value]?.[0] ?? value;
}

export function StatusBadge({ kind, value }: { kind: keyof typeof MAPS; value: string }) {
  const [label, tone] = MAPS[kind]?.[value] ?? [value, "neutral" as Tone];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return <Badge tone={role === "ADMIN" ? "brand" : "neutral"}>{ROLE_LABEL[role] ?? role}</Badge>;
}
