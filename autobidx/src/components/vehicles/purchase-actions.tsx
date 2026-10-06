"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HandCoins, Lock, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { Field, Input, Textarea } from "../ui/form";
import { useToast } from "../ui/toast";
import { FeeBreakdown, type Breakdown } from "./fee-breakdown";

/** BUY NOW and MAKE OFFER actions with server-computed fee breakdown before confirmation. */
export function PurchaseActions({
  vehicleId,
  buyNowPrice,
  canBuyNow,
  canOffer,
  askingPrice,
  signedIn,
  blockReason,
  loginNext,
  existingOffer,
}: {
  vehicleId: string;
  buyNowPrice: number | null;
  canBuyNow: boolean;
  canOffer: boolean;
  askingPrice: number;
  signedIn: boolean;
  blockReason: string | null;
  loginNext: string;
  existingOffer: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [mode, setMode] = useState<null | "buy" | "offer">(null);
  const [quote, setQuote] = useState<Breakdown | null>(null);
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function guard() {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(loginNext)}`);
      return false;
    }
    if (blockReason) {
      push({ tone: "error", title: blockReason });
      return false;
    }
    return true;
  }

  async function openBuy() {
    if (!guard() || !buyNowPrice) return;
    setMode("buy");
    setQuote(null);
    const { data } = await api<Breakdown>(`/api/fees/quote?vehicleId=${vehicleId}&price=${buyNowPrice}`);
    setQuote(data ?? null);
  }
  async function confirmBuy() {
    setBusy(true);
    const { data, error } = await api<{ next: string; orderNumber: string }>(`/api/vehicles/${vehicleId}/buy-now`, { method: "POST" });
    setBusy(false);
    if (error) {
      push({ tone: "error", title: error.message });
      setMode(null);
      router.refresh();
      return;
    }
    push({ tone: "success", title: `Order ${data!.orderNumber} created`, body: "Vehicle reserved for you. Complete payment to confirm." });
    router.push(data!.next);
  }
  async function submitOffer() {
    const amount = Number(offer.replace(/[^\d]/g, ""));
    if (!amount) return setErr("Enter your offer amount.");
    setBusy(true);
    const { error } = await api(`/api/vehicles/${vehicleId}/offers`, { body: { amount, message: msg || undefined } });
    setBusy(false);
    if (error) return setErr(error.message);
    push({ tone: "success", title: "Offer sent", body: "The seller has been notified. Track it under Offers." });
    setMode(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2.5">
      {canBuyNow && buyNowPrice && (
        <Button size="xl" variant="dark" block onClick={openBuy}>
          <Zap className="h-5 w-5 text-ignite-400" /> BUY NOW · {formatINR(buyNowPrice)}
        </Button>
      )}
      {canOffer && (
        <Button size="lg" variant="outline" block onClick={() => guard() && (existingOffer ? router.push("/dashboard/offers") : setMode("offer"))}>
          <HandCoins className="h-5 w-5" /> {existingOffer ? "VIEW YOUR OFFER" : "MAKE OFFER"}
        </Button>
      )}
      {blockReason && signedIn && (
        <p className="flex items-start gap-1.5 text-[12.5px] text-amber-700"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />{blockReason}</p>
      )}

      <Modal
        open={mode === "buy"}
        onClose={() => setMode(null)}
        title="Buy this vehicle now"
        footer={
          <>
            <Button variant="outline" onClick={() => setMode(null)} disabled={busy}>Cancel</Button>
            <Button onClick={confirmBuy} loading={busy} disabled={!quote}>Confirm & proceed to payment</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">The vehicle will be reserved for you and an order created. Complete payment within the payment window to secure it.</p>
        <div className="mt-4 rounded-xl border border-slate-200 p-4">{quote ? <FeeBreakdown b={quote} /> : <div className="py-6 text-center text-sm text-slate-400">Calculating fees…</div>}</div>
      </Modal>

      <Modal
        open={mode === "offer"}
        onClose={() => setMode(null)}
        title="Make an offer"
        footer={
          <>
            <Button variant="outline" onClick={() => setMode(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submitOffer} loading={busy}>Send offer</Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-slate-600">Asking price is <b>{formatINR(askingPrice)}</b>. The seller can accept, decline or counter. Offers expire automatically.</p>
        <div className="space-y-4">
          <Field label="Your offer" error={err ?? undefined} required>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
              <Input inputMode="numeric" className="num pl-7 text-lg font-bold" value={offer} onChange={(e) => { setErr(null); const n = Number(e.target.value.replace(/[^\d]/g, "")); setOffer(n ? n.toLocaleString("en-IN") : ""); }} placeholder={Math.round(askingPrice * 0.93).toLocaleString("en-IN")} />
            </div>
          </Field>
          <Field label="Message to seller (optional)">
            <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={500} placeholder="e.g. Can pick up this week; payment ready." />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
