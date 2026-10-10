"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, title, description, children }: { className?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-forest/40 backdrop-blur-[2px]" />
      <D.Content className={cn("fixed left-1/2 top-1/2 z-50 grid max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-[var(--radius-card)] border border-hairline bg-card p-6 shadow-[var(--shadow-card)]", className)}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <D.Title className="font-display text-xl text-ink">{title}</D.Title>
            {description && <D.Description className="mt-1 text-sm text-ink-2">{description}</D.Description>}
          </div>
          <D.Close className="rounded-full p-1 text-ink-3 hover:bg-sand" aria-label="Close"><X className="size-4" /></D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
