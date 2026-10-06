"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Eye, MoreHorizontal, Pencil, RotateCcw, Send, Sparkles, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Modal, ConfirmationDialog } from "../ui/modal";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/form";
import { useToast } from "../ui/toast";
import { PaymentForm } from "./payment-form";

export function VehicleRowActions({ v, methods, featuredFee }: { v: { id: string; status: string; href: string; auctionEnabled: boolean; inspectionPending: boolean; featured: boolean }; methods: string[]; featuredFee: number }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<null | "withdraw" | "feature" | "relist" | "inspection">(null);
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState("24");

  async function call(url: string, body?: unknown, success = "Done") {
    setBusy(true);
    const { error } = await api(url, { method: "POST", body: body ?? {} });
    setBusy(false);
    if (error) return push({ tone: "error", title: error.message });
    push({ tone: "success", title: success });
    setModal(null);
    router.refresh();
  }
  const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] text-slate-700 hover:bg-slate-50";
  const live = ["PUBLISHED", "AUCTION_LIVE"].includes(v.status);
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)} className="rounded-lg border border-slate-200 p-1.5 hover:border-slate-400" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-[var(--shadow-lift)]">
          <Link href={v.href} className={item}><Eye className="h-4 w-4" />View listing</Link>
          <Link href={`/dashboard/vehicles/${v.id}`} className={item}><Pencil className="h-4 w-4" />Edit</Link>
          {(v.status === "DRAFT" || v.status === "REJECTED") && <button className={item} onMouseDown={() => call(`/api/vehicles/${v.id}/submit`, undefined, "Submitted for approval")}><Send className="h-4 w-4" />Submit for approval</button>}
          {live && !v.featured && <button className={item} onMouseDown={() => setModal("feature")}><Sparkles className="h-4 w-4" />Feature listing</button>}
          {live && !v.inspectionPending && <button className={item} onMouseDown={() => setModal("inspection")}><ClipboardCheck className="h-4 w-4" />Request inspection</button>}
          {(v.status === "AUCTION_ENDED" || (v.status === "PUBLISHED" && !v.auctionEnabled)) && <button className={item} onMouseDown={() => setModal("relist")}><RotateCcw className="h-4 w-4" />{v.status === "AUCTION_ENDED" ? "Relist auction" : "Start an auction"}</button>}
          {!["SOLD", "RESERVED", "CANCELLED"].includes(v.status) && <button className={`${item} text-red-600`} onMouseDown={() => setModal("withdraw")}><XCircle className="h-4 w-4" />Withdraw listing</button>}
        </div>
      )}
      <ConfirmationDialog open={modal === "withdraw"} onClose={() => setModal(null)} onConfirm={() => call(`/api/vehicles/${v.id}/withdraw`, undefined, "Listing withdrawn")} loading={busy} title="Withdraw this listing?" body="It will be removed from the marketplace. Auctions with bids can't be withdrawn." confirmLabel="Withdraw" tone="danger" />
      <ConfirmationDialog open={modal === "inspection"} onClose={() => setModal(null)} onConfirm={() => call(`/api/vehicles/${v.id}/inspection`, {}, "Inspection requested — our partner will contact you")} loading={busy} title="Request a vehicle inspection" body="An Alpha Cars inspection partner will inspect the vehicle and publish a scored report with an 'Inspected' badge on your listing." confirmLabel="Request inspection" />
      <Modal open={modal === "relist"} onClose={() => setModal(null)} title={v.status === "AUCTION_ENDED" ? "Relist as a new auction" : "Start an auction"} footer={<><Button variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button loading={busy} onClick={() => call(`/api/vehicles/${v.id}/relist`, { durationHours: Number(hours) }, "Auction started")}>Start auction</Button></>}>
        <Field label="Duration (hours)" hint="Starts immediately. Reserve and starting bid are taken from the listing."><Input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))} /></Field>
      </Modal>
      <Modal open={modal === "feature"} onClose={() => setModal(null)} title="Feature this listing">
        <p className="mb-4 text-sm text-slate-600">Featured listings appear on the homepage and at the top of search with a gold badge. Fee: <b>₹{featuredFee.toLocaleString("en-IN")}</b> incl. GST.</p>
        <PaymentForm target={{ purpose: "FEATURED_LISTING", targetId: v.id }} methods={methods.filter((m) => m !== "BANK_TRANSFER")} amount={featuredFee} />
      </Modal>
    </div>
  );
}
