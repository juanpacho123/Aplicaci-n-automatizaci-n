import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "./cn";

const tones = {
  info: { box: "border-action-100 bg-action-50 text-ink-800", icon: Info, iconClass: "text-action-600" },
  success: { box: "border-success-100 bg-success-50 text-ink-800", icon: CheckCircle2, iconClass: "text-success-700" },
  warning: { box: "border-warning-100 bg-warning-50 text-ink-800", icon: AlertTriangle, iconClass: "text-warning-700" },
  danger: { box: "border-danger-100 bg-danger-50 text-ink-800", icon: XCircle, iconClass: "text-danger-700" },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof tones;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  const Icon = t.icon;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border px-3.5 py-3", t.box, className)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", t.iconClass)} aria-hidden />
      <div className="min-w-0 flex-1 text-[0.8125rem] leading-5">
        {title ? <p className="font-semibold text-ink-900">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "text-ink-700")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
