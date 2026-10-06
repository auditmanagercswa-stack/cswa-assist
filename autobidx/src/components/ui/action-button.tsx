"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "./button";
import { ConfirmationDialog } from "./modal";
import { Textarea } from "./form";
import { useToast } from "./toast";

/**
 * Generic "POST this to the API" button with optional confirmation and reason prompt.
 * Used across dashboard/admin screens so every action is a real server call.
 */
export function ActionButton({
  url,
  body,
  method = "POST",
  label,
  confirm,
  reason,
  success = "Done",
  variant = "outline",
  size = "sm",
  redirect,
  danger,
  icon,
}: {
  url: string;
  body?: Record<string, unknown>;
  method?: string;
  label: ReactNode;
  confirm?: { title: string; body?: ReactNode; label?: string };
  reason?: { label: string; required?: boolean; field?: string };
  success?: string;
  variant?: "primary" | "dark" | "outline" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  redirect?: string;
  danger?: boolean;
  icon?: ReactNode;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");

  async function run() {
    if (reason?.required && text.trim().length < 3) {
      push({ tone: "error", title: "Please add a reason" });
      return;
    }
    setBusy(true);
    const payload = { ...(body ?? {}), ...(reason ? { [reason.field ?? "reason"]: text } : {}) };
    const { data, error } = await api<{ next?: string; orderId?: string }>(url, { method, body: payload });
    setBusy(false);
    if (error) {
      push({ tone: "error", title: error.message });
      return;
    }
    setOpen(false);
    push({ tone: "success", title: success });
    if (data?.next) router.push(data.next);
    else if (redirect) router.push(redirect);
    else router.refresh();
  }

  const needsDialog = !!confirm || !!reason;
  return (
    <>
      <Button variant={danger ? "danger" : variant} size={size} loading={busy && !needsDialog} onClick={() => (needsDialog ? setOpen(true) : run())}>
        {icon}
        {label}
      </Button>
      {needsDialog && (
        <ConfirmationDialog open={open} onClose={() => setOpen(false)} onConfirm={run} loading={busy} title={confirm?.title ?? String(label)} body={confirm?.body} confirmLabel={confirm?.label ?? "Confirm"} tone={danger ? "danger" : "primary"}>
          {reason && (
            <div className="mt-3">
              <label className="mb-1 block text-[13px] font-semibold text-slate-700">{reason.label}</label>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
            </div>
          )}
        </ConfirmationDialog>
      )}
    </>
  );
}
