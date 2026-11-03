import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "./cn";

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-2xs font-semibold uppercase tracking-[0.08em] text-ink-500">{eyebrow}</div> : null}
        <h1 className="text-xl font-semibold leading-7 sm:text-[1.375rem]">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-[0.8125rem] text-ink-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = "inline-flex size-8 items-center justify-center rounded-md border border-line bg-surface text-ink-700 hover:bg-subtle";
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[0.8125rem] text-ink-600" aria-label="Paginación">
      <span data-numeric>
        {from}–{to} de {total.toLocaleString("es")}
      </span>
      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={link} aria-label="Página anterior">
            <ChevronLeft className="size-4" />
          </Link>
        ) : (
          <span className={cn(link, "opacity-40")} aria-hidden>
            <ChevronLeft className="size-4" />
          </span>
        )}
        <span className="px-2" data-numeric>
          {page} / {pages}
        </span>
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={link} aria-label="Página siguiente">
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className={cn(link, "opacity-40")} aria-hidden>
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </nav>
  );
}

export function LinkTabs({ tabs, active }: { tabs: { href: string; label: string; key: string; count?: number }[]; active: string }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={t.key === active}
          className={cn(
            "-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-[0.8125rem] font-medium",
            t.key === active ? "border-brand-700 text-ink-950" : "border-transparent text-ink-500 hover:text-ink-800",
          )}
        >
          {t.label}
          {t.count !== undefined ? <span className="rounded-sm bg-ink-900/[0.06] px-1.5 text-2xs text-ink-600" data-numeric>{t.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}
