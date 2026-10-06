"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Star } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { Field, Input, Select, Textarea } from "../ui/form";
import { useToast } from "../ui/toast";
import { DocumentUploader } from "../forms/document-uploader";

const LABEL: Record<string, string> = {
  SELLER_CONFIRMED: "Confirm sale",
  DOCUMENTS_PENDING: "Start documentation",
  VEHICLE_READY: "Mark vehicle ready",
  IN_DELIVERY: "Schedule pickup / delivery",
  COMPLETED: "Confirm vehicle received",
  CANCELLED: "Cancel order",
};

export function OrderActions({ orderId, actions, apiBase = "/api/orders" }: { orderId: string; actions: string[]; apiBase?: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [modal, setModal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  async function go(to: string) {
    setBusy(true);
    const url = apiBase === "/api/orders" ? `/api/orders/${orderId}/transition` : `${apiBase}/${orderId}`;
    const body = apiBase === "/api/orders" ? { to, note: note || undefined, deliveryMode: to === "IN_DELIVERY" ? mode : undefined, deliveryDate: to === "IN_DELIVERY" ? date : undefined } : { action: "transition", to, note: note || undefined, deliveryMode: to === "IN_DELIVERY" ? mode : undefined };
    const { error } = await api(url, { body });
    setBusy(false);
    if (error) return push({ tone: "error", title: error.message });
    push({ tone: "success", title: `Order updated: ${LABEL[to] ?? to}` });
    setModal(null);
    setNote("");
    router.refresh();
  }
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Button key={a} variant={a === "CANCELLED" ? "outline" : "primary"} size="md" onClick={() => setModal(a)}>{LABEL[a] ?? a}</Button>
      ))}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal ? LABEL[modal] : ""}
        size="sm"
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Back</Button><Button variant={modal === "CANCELLED" ? "danger" : "primary"} loading={busy} onClick={() => modal && go(modal)}>{modal === "CANCELLED" ? "Cancel order" : "Confirm"}</Button></>}
      >
        {modal === "IN_DELIVERY" && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Field label="Handover"><Select value={mode} onChange={(e) => setMode(e.target.value as "PICKUP" | "DELIVERY")}><option value="PICKUP">Buyer pickup</option><option value="DELIVERY">Delivery to buyer</option></Select></Field>
            <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
        )}
        {modal === "COMPLETED" && <p className="mb-3 text-sm text-slate-600">Confirm only after you&apos;ve received the vehicle and original documents. This releases the seller&apos;s payout. If something&apos;s wrong, raise a dispute instead.</p>}
        {modal === "VEHICLE_READY" && <p className="mb-3 text-sm text-slate-600">The RC copy must be uploaded before marking the vehicle ready.</p>}
        {modal === "CANCELLED" && <p className="mb-3 text-sm text-slate-600">The vehicle will go back on the marketplace. Paid orders are cancelled by AutoBidX support with a refund.</p>}
        <Field label={modal === "CANCELLED" ? "Reason" : "Note (optional)"}><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}

export function OrderDocUpload({ orderId, types }: { orderId: string; types: { value: string; label: string }[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [type, setType] = useState(types[0]?.value ?? "RC");
  const [key, setKey] = useState(0);
  async function attach(v: { fileId: string; name: string } | null) {
    if (!v) return;
    const { error } = await api(`/api/orders/${orderId}/documents`, { body: { type, fileId: v.fileId } });
    if (error) return push({ tone: "error", title: error.message });
    push({ tone: "success", title: "Document uploaded" });
    setKey((k) => k + 1);
    router.refresh();
  }
  return (
    <div className="grid gap-3 sm:grid-cols-[180px_1fr] sm:items-end">
      <Field label="Document type"><Select value={type} onChange={(e) => setType(e.target.value)}>{types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
      <DocumentUploader key={key} label="Upload file" purpose="order-doc" value={null} onChange={attach} />
    </div>
  );
}

const CATS: Record<string, string> = { CONDITION_MISMATCH: "Vehicle condition mismatch", DOCUMENTATION: "Documentation issue", PAYMENT: "Payment issue", DELIVERY: "Delivery issue", FRAUD: "Fraud concern", BUYER_CANCELLATION: "Buyer cancellation", OTHER: "Other" };

export function RaiseDispute({ orderId, party }: { orderId: string; party: "buyer" | "seller" }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const cats = party === "buyer" ? ["CONDITION_MISMATCH", "DOCUMENTATION", "PAYMENT", "DELIVERY", "FRAUD", "OTHER"] : ["PAYMENT", "BUYER_CANCELLATION", "DOCUMENTATION", "OTHER"];
  const [f, setF] = useState({ category: cats[0], subject: "", description: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    const { error } = await api(`/api/orders/${orderId}/dispute`, { body: f });
    setBusy(false);
    if (error) {
      setErrors(error.details?.fields ?? {});
      return push({ tone: "error", title: error.message });
    }
    push({ tone: "success", title: "Dispute raised", body: "Our team will investigate and keep both parties updated." });
    setOpen(false);
    router.refresh();
  }
  return (
    <>
      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setOpen(true)}>Raise a dispute</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Raise a dispute" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" loading={busy} onClick={submit}>Submit dispute</Button></>}>
        <p className="mb-4 text-sm text-slate-600">The order is paused and any payout held while AutoBidX investigates.</p>
        <div className="space-y-3">
          <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{cats.map((c) => <option key={c} value={c}>{CATS[c]}</option>)}</Select></Field>
          <Field label="Subject" error={errors.subject}><Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={120} /></Field>
          <Field label="What happened?" error={errors.description}><Textarea rows={5} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  );
}

export function DisputeThread({ dispute, isAdmin = false }: { dispute: { id: string; number: string; status: string; subject: string; messages: { id: string; body: string; internal: boolean; kind: string; createdAt: string; author: string; isStaff: boolean }[] }; isAdmin?: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const closed = ["RESOLVED", "REFUNDED", "CLOSED"].includes(dispute.status);
  async function send(requestDocuments = false) {
    setBusy(true);
    const { error } = await api(`/api/disputes/${dispute.id}/messages`, { body: { body, internal: isAdmin ? internal : undefined, requestDocuments: isAdmin ? requestDocuments : undefined } });
    setBusy(false);
    if (error) return push({ tone: "error", title: error.message });
    setBody("");
    router.refresh();
  }
  return (
    <div>
      <ol className="space-y-3">
        {dispute.messages.map((m) => (
          <li key={m.id} className={cn("rounded-xl p-3 text-[13.5px]", m.internal ? "border border-dashed border-amber-300 bg-amber-50" : m.kind === "STATUS" ? "bg-slate-50 text-slate-600" : m.isStaff ? "bg-ink-900/[0.04]" : "bg-white ring-1 ring-slate-200")}>
            <div className="mb-1 flex items-center justify-between gap-2 text-[12px] text-slate-500">
              <span className="font-semibold text-ink-900">{m.author}{m.isStaff && " · AutoBidX"}{m.internal && " · internal note"}{m.kind === "DOCUMENT_REQUEST" && " · documents requested"}</span>
              <span suppressHydrationWarning>{timeAgo(m.createdAt)}</span>
            </div>
            <div className="whitespace-pre-line text-slate-700">{m.body}</div>
          </li>
        ))}
      </ol>
      {!closed && (
        <div className="mt-4 space-y-2">
          <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {isAdmin ? <label className="flex items-center gap-2 text-[13px] text-slate-600"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-ignite-500" />Internal note (not visible to parties)</label> : <span />}
            <div className="flex gap-2">
              {isAdmin && <Button size="sm" variant="outline" disabled={!body.trim()} loading={busy} onClick={() => send(true)}>Request documents</Button>}
              <Button size="sm" disabled={!body.trim()} loading={busy} onClick={() => send(false)}>Send</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReviewForm({ orderId, subject }: { orderId: string; subject: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    const { error } = await api(`/api/orders/${orderId}/review`, { body: { rating, comment: comment || undefined } });
    setBusy(false);
    if (error) return push({ tone: "error", title: error.message });
    push({ tone: "success", title: "Thanks for your review" });
    router.refresh();
  }
  return (
    <div>
      <div className="text-[14px] font-semibold text-ink-900">Rate {subject}</div>
      <div className="mt-2 flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`}>
            <Star className={cn("h-7 w-7", (hover || rating) >= n ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
          </button>
        ))}
      </div>
      <Textarea className="mt-3" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional — share how the transaction went" maxLength={1000} />
      <Button className="mt-2" size="sm" disabled={!rating} loading={busy} onClick={submit}>Submit review</Button>
    </div>
  );
}

export function ReviewDone({ rating, comment }: { rating: number; comment: string | null }) {
  return (
    <div className="flex items-start gap-2 text-[13.5px] text-slate-600">
      <CheckCircle2 className="mt-0.5 h-4 w-4 text-verified-500" />
      <div>You rated {rating}★{comment ? ` — “${comment}”` : ""}</div>
    </div>
  );
}
