"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

export function RefundButton({ id, max }: { id: string; max: number }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(max));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    const { error } = await api(`/api/admin/payments/${id}`, { body: { action: "refund", amount: Number(amount), reason } });
    setBusy(false);
    if (error) return push({ tone: "error", title: error.message });
    push({ tone: "success", title: "Refund initiated" });
    setOpen(false);
    router.refresh();
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Refund</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Issue refund" size="sm" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" loading={busy} onClick={submit}>Refund {formatINR(Number(amount) || 0)}</Button></>}>
        <div className="space-y-3">
          <Field label="Amount" hint={`Up to ${formatINR(max)} (partial refunds allowed)`}><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Reason (shared with the payer)"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
      </Modal>
    </>
  );
}
