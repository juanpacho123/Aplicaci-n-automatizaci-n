import { PageHeader } from "@/components/ui/page";
import { MicrosoftStatus, SettingsForms } from "@/components/admin/settings-forms";
import { requirePageAuth } from "@/lib/authz/guards";
import { isDemoMode, microsoftConfigStatus } from "@/lib/config/env";
import { getSettings } from "@/lib/services/settings.service";

export const metadata = { title: "Configuración" };

export default async function SettingsPage() {
  await requirePageAuth("settings:manage");
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Configuración" description="Parámetros administrativos del portal. Las credenciales y secretos se gestionan solo en el servidor." />
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SettingsForms settings={settings} />
        </div>
        <div>
          <MicrosoftStatus checks={microsoftConfigStatus().checks} demo={isDemoMode()} />
        </div>
      </div>
    </>
  );
}
