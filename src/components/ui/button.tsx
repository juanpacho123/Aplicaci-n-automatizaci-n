import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-600 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 shadow-xs",
        action: "bg-action-600 text-white hover:bg-action-700 shadow-xs",
        secondary: "bg-surface text-ink-900 border border-line-strong hover:bg-subtle hover:border-ink-300 shadow-xs",
        ghost: "text-ink-700 hover:bg-ink-900/5 hover:text-ink-900",
        danger: "bg-danger-700 text-white hover:bg-danger-800 shadow-xs",
        "danger-outline": "border border-danger-100 bg-surface text-danger-700 hover:bg-danger-50",
        link: "text-action-600 underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-[0.8125rem] [&_svg]:size-3.5",
        md: "h-9 px-3.5 text-sm [&_svg]:size-4",
        lg: "h-11 px-5 text-[0.9375rem] [&_svg]:size-4.5",
        icon: "size-9 [&_svg]:size-4",
        "icon-sm": "size-8 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {children}
        </>
      )}
    </Comp>
  );
});
Button.displayName = "Button";
