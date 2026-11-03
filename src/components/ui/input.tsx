import * as React from "react";
import { cn } from "./cn";

const base =
  "w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 shadow-xs transition-colors focus:border-action-600 focus:outline-none focus:ring-3 focus:ring-action-100 disabled:bg-subtle disabled:text-ink-500 aria-[invalid=true]:border-danger-700 aria-[invalid=true]:focus:ring-danger-100";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(base, "h-9", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, "min-h-24 py-2 leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select ref={ref} className={cn(base, "h-9 appearance-none pr-9", className)} {...props}>
      {children}
    </select>
    <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-500">
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[0.8125rem] font-medium text-ink-800", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-danger-700" aria-hidden>*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-[0.8125rem] text-danger-700" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[0.8125rem] text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className={cn("size-4 rounded-sm border-line-strong accent-brand-700", className)} {...props} />;
}
