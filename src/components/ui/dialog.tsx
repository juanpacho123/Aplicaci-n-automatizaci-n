"use client";
import * as React from "react";
import { Dialog as D, AlertDialog as AD } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "./cn";
import { Button } from "./button";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

const overlay = "fixed inset-0 z-50 bg-ink-950/45";
const content =
  "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-line bg-surface shadow-overlay focus:outline-none";

export function DialogContent({ className, children, size = "md", hideClose, ...props }: React.ComponentProps<typeof D.Content> & { size?: "sm" | "md" | "lg" | "xl"; hideClose?: boolean }) {
  const width = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[size];
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content className={cn(content, width, className)} {...props}>
        {children}
        {!hideClose ? (
          <D.Close className="absolute right-3 top-3 rounded-sm p-1.5 text-ink-500 hover:bg-ink-900/5 hover:text-ink-900" aria-label="Cerrar">
            <X className="size-4" />
          </D.Close>
        ) : null}
      </D.Content>
    </D.Portal>
  );
}

export function DialogHeader({ title, description }: { title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <div className="border-b border-line px-5 py-4 pr-12">
      <D.Title className="text-base font-semibold text-ink-950">{title}</D.Title>
      {description ? <D.Description className="mt-0.5 text-[0.8125rem] text-ink-500">{description}</D.Description> : <D.Description className="sr-only">{String(title)}</D.Description>}
    </div>
  );
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex-1 overflow-y-auto px-5 py-4", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col-reverse gap-2 border-t border-line bg-subtle px-5 py-3 sm:flex-row sm:justify-end", className)} {...props} />;
}

/** Confirmación para acciones con efectos (suspender, eliminar, crear en SharePoint…). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "Confirmar",
  tone = "primary",
  loading,
  onConfirm,
  confirmDisabled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  confirmDisabled?: boolean;
}) {
  return (
    <AD.Root open={open} onOpenChange={onOpenChange}>
      <AD.Portal>
        <AD.Overlay className={overlay} />
        <AD.Content className={cn(content, "sm:max-w-lg")}>
          <div className="border-b border-line px-5 py-4">
            <AD.Title className="text-base font-semibold text-ink-950">{title}</AD.Title>
            {description ? <AD.Description className="mt-1 text-[0.8125rem] text-ink-600">{description}</AD.Description> : <AD.Description className="sr-only">{title}</AD.Description>}
          </div>
          {children ? <div className="px-5 py-4">{children}</div> : null}
          <div className="flex flex-col-reverse gap-2 border-t border-line bg-subtle px-5 py-3 sm:flex-row sm:justify-end">
            <AD.Cancel asChild>
              <Button variant="secondary" disabled={loading}>
                Cancelar
              </Button>
            </AD.Cancel>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              loading={loading}
              disabled={confirmDisabled}
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}

/** Panel lateral (navegación móvil). */
export function Sheet({ open, onOpenChange, children, title }: { open: boolean; onOpenChange: (v: boolean) => void; children: React.ReactNode; title: string }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content className="fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col bg-brand-900 shadow-overlay focus:outline-none">
          <D.Title className="sr-only">{title}</D.Title>
          <D.Description className="sr-only">{title}</D.Description>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
