import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

export type FilterField =
  | { type: "search"; name: string; placeholder: string }
  | { type: "select"; name: string; label: string; options: { value: string; label: string }[] }
  | { type: "date"; name: string; label: string };

/** Barra de filtros como formulario GET (funciona sin JavaScript y conserva la URL). */
export function FilterBar({ fields, values, resetHref, hidden }: { fields: FilterField[]; values: Record<string, string | undefined>; resetHref: string; hidden?: Record<string, string> }) {
  const active = fields.some((f) => values[f.name]);
  return (
    <form method="get" className="flex flex-col gap-2 border-b border-line px-4 py-3 md:flex-row md:flex-wrap md:items-end" role="search">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) =>
        f.type === "search" ? (
          <div key={f.name} className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <Input name={f.name} defaultValue={values[f.name] ?? ""} placeholder={f.placeholder} className="pl-9" aria-label={f.placeholder} />
          </div>
        ) : f.type === "select" ? (
          <label key={f.name} className="flex min-w-40 flex-col gap-1 text-2xs font-medium uppercase tracking-[0.05em] text-ink-500">
            {f.label}
            <Select name={f.name} defaultValue={values[f.name] ?? ""} className="normal-case tracking-normal">
              <option value="">Todos</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
        ) : (
          <label key={f.name} className="flex flex-col gap-1 text-2xs font-medium uppercase tracking-[0.05em] text-ink-500">
            {f.label}
            <Input type="date" name={f.name} defaultValue={values[f.name] ?? ""} className="w-40 normal-case" />
          </label>
        ),
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary">
          Filtrar
        </Button>
        {active ? (
          <Button asChild variant="ghost">
            <Link href={resetHref}>Limpiar</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
