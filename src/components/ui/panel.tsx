import * as React from "react";
import { cn } from "./cn";

export function Panel({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-lg border border-line bg-surface shadow-xs", className)} {...props} />;
}

export function PanelHeader({ title, description, actions, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5", className)}>
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-semibold leading-6">{title}</h2>
        {description ? <p className="text-[0.8125rem] text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PanelBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-4 sm:px-5", className)} {...props} />;
}

export function DescriptionList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-2xs font-medium uppercase tracking-[0.05em] text-ink-500">{i.label}</dt>
          <dd className="mt-0.5 text-sm text-ink-900 break-words">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
