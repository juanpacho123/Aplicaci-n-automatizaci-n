import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { AccessRequestForm } from "@/components/shared/access-request-form";

export const metadata = { title: "Solicitar acceso" };

export default function RequestAccessPage() {
  return (
    <div className="w-full max-w-lg">
      <Panel>
        <div className="border-b border-line px-6 py-5">
          <h1 className="text-lg font-semibold">Solicitud de acceso</h1>
          <p className="mt-1 text-[0.8125rem] text-ink-600">
            Complete el formulario para que el administrador evalúe su autorización. La solicitud no habilita el acceso por sí sola.
          </p>
        </div>
        <div className="px-6 py-5">
          <AccessRequestForm />
        </div>
        <div className="border-t border-line bg-subtle px-6 py-3 text-[0.8125rem]">
          <Link href="/login" className="text-ink-600 hover:text-ink-900 hover:underline">
            Volver a iniciar sesión
          </Link>
        </div>
      </Panel>
    </div>
  );
}
