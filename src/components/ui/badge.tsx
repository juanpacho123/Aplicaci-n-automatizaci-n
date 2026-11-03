import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

export const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-2xs font-medium uppercase tracking-[0.04em] whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-ink-900/[0.06] text-ink-700",
      brand: "bg-brand-100 text-brand-800",
      info: "bg-action-50 text-action-700",
      success: "bg-success-50 text-success-800",
      warning: "bg-warning-50 text-warning-800",
      danger: "bg-danger-50 text-danger-800",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, dot, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden /> : null}
      {children}
    </span>
  );
}
