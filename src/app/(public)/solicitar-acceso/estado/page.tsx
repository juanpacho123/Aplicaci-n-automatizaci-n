import Link from "next/link";
import { Panel } from "@/components/ui/panel";
import { RequestStatusLookup } from "@/components/shared/access-request-form";

export const metadata = { title: "Estado de la solicitud" };

export default function RequestStatusPage() {
  return (
    <div className="w-full max-w-lg">
      <Panel>
        <div className="border-b border-line px-6 py-5">
          <h1 className="text-lg font-semibold">Estado de la solicitud</h1>
          <p className="mt-1 text-[0.8125rem] text-ink-600">Ingrese el código de seguimiento que recibió al registrar su solicitud.</p>
        </div>
        <div className="px-6 py-5">
          <RequestStatusLookup />
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
