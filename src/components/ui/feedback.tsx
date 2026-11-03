import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export function Spinner({ className, label = "Cargando" }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-ink-500", className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-sm bg-ink-900/[0.07]", className)} aria-hidden />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      {icon ? <div className="mb-3 flex size-10 items-center justify-center rounded-md border border-line bg-subtle text-ink-500 [&_svg]:size-5">{icon}</div> : null}
      <p className="text-sm font-semibold text-ink-900">{title}</p>
      {description ? <p className="mt-1 max-w-md text-[0.8125rem] text-ink-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Progress({ value, tone = "action", className, label }: { value: number; tone?: "action" | "success" | "danger"; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = tone === "success" ? "bg-success-700" : tone === "danger" ? "bg-danger-700" : "bg-action-600";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-ink-900/[0.08]", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <div className={cn("h-full rounded-full transition-[width] duration-200", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
