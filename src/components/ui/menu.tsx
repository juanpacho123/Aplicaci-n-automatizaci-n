"use client";
import * as React from "react";
import { DropdownMenu as M } from "radix-ui";
import { cn } from "./cn";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className={cn("z-50 min-w-48 rounded-md border border-line bg-surface p-1 shadow-overlay", className)} {...props} />
    </M.Portal>
  );
}

export function MenuItem({ className, tone, ...props }: React.ComponentProps<typeof M.Item> & { tone?: "danger" }) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-1.5 text-[0.8125rem] text-ink-800 outline-none data-[highlighted]:bg-ink-900/5 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-ink-500",
        tone === "danger" && "text-danger-700 [&_svg]:text-danger-700",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-[0.05em] text-ink-500", className)} {...props} />;
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-line" />;
}
