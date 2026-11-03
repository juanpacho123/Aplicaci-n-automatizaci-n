import { cn } from "@/components/ui/cn";

/** Marca del portal: monograma de documentos apilados. */
export function BrandMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="6" fill={inverted ? "#ffffff" : "#123b6d"} />
      <path d="M10 8.5h8.5l3.5 3.5v11.5H10z" fill="none" stroke={inverted ? "#123b6d" : "#ffffff"} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M18.5 8.5V12H22" fill="none" stroke={inverted ? "#123b6d" : "#ffffff"} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13 15.5h6M13 18.5h6M13 21h3.5" stroke={inverted ? "#3a76cf" : "#8fb3e6"} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function BrandLockup({ name, subtitle, inverted, className }: { name: string; subtitle?: string; inverted?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark inverted={inverted} className="shrink-0" />
      <div className="min-w-0 leading-tight">
        <div className={cn("truncate text-[0.8125rem] font-semibold", inverted ? "text-white" : "text-ink-950")}>{name}</div>
        {subtitle ? <div className={cn("truncate text-2xs", inverted ? "text-brand-100/70" : "text-ink-500")}>{subtitle}</div> : null}
      </div>
    </div>
  );
}
