import { PageHeader } from "@/components/ui/page";
import { Panel, PanelBody, PanelHeader, DescriptionList } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { RoleBadge, StatusBadge } from "@/components/shared/status";
import { formatDateTime } from "@/components/shared/format";
import { requirePageAuth } from "@/lib/authz/guards";
import { db } from "@/lib/db/prisma";

export const metadata = { title: "Mi perfil" };

export default async function ProfilePage() {
  const ctx = await requirePageAuth("project:read");
  const user = await db.user.findUniqueOrThrow({
    where: { id: ctx.user.id },
    include: { company: true, projects: { include: { project: true }, orderBy: { grantedAt: "desc" } }, authorizedBy: { select: { fullName: true } } },
  });
  return (
    <>
      <PageHeader title="Mi perfil" description="Datos de su registro en el portal. Para modificarlos, contacte al administrador." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Datos del usuario" actions={<StatusBadge kind="user" value={user.status} />} />
          <PanelBody>
            <DescriptionList
              items={[
                { label: "Nombre completo", value: user.fullName },
                { label: "Correo electrónico", value: user.email },
                { label: "Empresa", value: user.company?.name ?? "—" },
                { label: "Teléfono", value: user.phone ?? "—" },
                { label: "Rol", value: <RoleBadge role={user.roleKey} /> },
                { label: "Tipo de identidad", value: user.identityType === "GUEST" ? "Invitado externo (B2B)" : user.identityType === "MEMBER" ? "Cuenta de la organización" : "—" },
                { label: "Identidad verificada", value: user.identityBoundAt ? `Sí, desde ${formatDateTime(user.identityBoundAt)}` : ctx.session.authMethod === "DEMO" ? <Badge tone="warning">Sesión de demostración</Badge> : "Pendiente" },
                { label: "Autorizado por", value: user.authorizedBy?.fullName ?? "—" },
                { label: "Fecha de registro", value: formatDateTime(user.createdAt) },
                { label: "Último inicio de sesión", value: formatDateTime(user.lastLoginAt) },
              ]}
            />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Proyectos autorizados" description={`${user.projects.length} asignados`} />
          <ul className="divide-y divide-line">
            {user.projects.map((up) => (
              <li key={up.projectId} className="px-4 py-2.5 text-[0.8125rem]">
                <span className="font-medium text-ink-900">{up.project.code}</span> · {up.project.name}
                <span className="block text-[0.75rem] text-ink-500">Desde {formatDateTime(up.grantedAt)}</span>
              </li>
            ))}
            {user.projects.length === 0 ? <li className="px-4 py-3 text-[0.8125rem] text-ink-500">Sin proyectos asignados.</li> : null}
          </ul>
        </Panel>
      </div>
    </>
  );
}
