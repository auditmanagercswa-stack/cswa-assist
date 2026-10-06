"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

export function DisputeResolver({ id, status, refundable }: { id: string; status: string; refundable: number }) {
  const router = useRouter();
  const { push } = useToast();
  const [next, setNext] = useState(status === "OPEN" ? "INVESTIGATING" : "RESOLVED");
  const [resolution, setResolution] = useState("");
  const [refund, setRefund] = useState("");
  const [penalty, setPenalty] = useState("");
  const [penaltyParty, setPenaltyParty] = useState("SELLER");
  const [cancelOrder, setCancelOrder] = useState(false);
  const [busy, setBusy] = useState(false);
  const closing = ["RESOLVED", "REFUNDED", "CLOSED"].includes(next);
  async function submit() {
    setBusy(true);
    const { error } = await api(`/api/admin/disputes/${id}`, {
      body: { status: next, resolution: resolution || undefined, refundAmount: refund ? Number(refund) : undefined, penaltyAmount: penalty ? Number(penalty) : undefined, penaltyParty: penalty ? penaltyParty : undefined, cancelOrder: closing ? cancelOrder : undefined, restoreOrder: closing && !cancelOrder },
    });
    setBusy(false);
    if (error) return push({ tone: "error", title: error.message });
    push({ tone: "success", title: "Dispute updated", body: "Both parties have been notified." });
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <Field label="Set status">
        <Select value={next} onChange={(e) => setNext(e.target.value)}>
          <option value="INVESTIGATING">Investigating</option>
          <option value="AWAITING_DOCUMENTS">Awaiting documents</option>
          <option value="RESOLVED">Resolve</option>
          <option value="CLOSED">Close (no action)</option>
        </Select>
      </Field>
      {closing && (
        <>
          <Field label="Resolution summary (shared with both parties)"><Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Refund to buyer" hint={refundable ? `Up to ${formatINR(refundable)}` : "No captured payment"}><Input inputMode="numeric" disabled={!refundable} value={refund} onChange={(e) => setRefund(e.target.value.replace(/\D/g, ""))} placeholder="0" /></Field>
            <Field label="Penalty (recorded)"><div className="flex gap-2"><Input inputMode="numeric" value={penalty} onChange={(e) => setPenalty(e.target.value.replace(/\D/g, ""))} placeholder="0" /><Select value={penaltyParty} onChange={(e) => setPenaltyParty(e.target.value)} className="w-32"><option value="SELLER">Seller</option><option value="BUYER">Buyer</option></Select></div></Field>
          </div>
          <Checkbox checked={cancelOrder} onChange={(e) => setCancelOrder(e.target.checked)} label="Cancel the order (otherwise the order resumes from where it paused)" />
        </>
      )}
      <Button onClick={submit} loading={busy} variant={closing ? "primary" : "dark"}>{closing ? "Resolve dispute" : "Update status"}</Button>
    </div>
  );
}
