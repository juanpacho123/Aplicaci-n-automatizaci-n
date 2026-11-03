"use client";
import * as React from "react";
import { Switch as S } from "radix-ui";
import { cn } from "./cn";

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root className={cn("relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-ink-300 transition-colors data-[state=checked]:bg-brand-700 disabled:opacity-50", className)} {...props}>
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[1.05rem]" />
    </S.Root>
  );
}
