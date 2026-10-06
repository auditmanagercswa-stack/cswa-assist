"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CreditCard, Landmark, Smartphone, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/format";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { useToast } from "../ui/toast";

const METHODS: Record<string, { label: string; sub: string; icon: typeof Smartphone }> = {
  UPI: { label: "UPI", sub: "Google Pay, PhonePe, Paytm, BHIM", icon: Smartphone },
  NETBANKING: { label: "Net banking", sub: "All major Indian banks", icon: Landmark },
  CARD: { label: "Debit / credit card", sub: "Visa, Mastercard, RuPay", icon: CreditCard },
  BANK_TRANSFER: { label: "Bank transfer", sub: "NEFT / RTGS / IMPS — for large amounts", icon: Building2 },
};

type Target = { orderId: string } | { purpose: "LISTING_FEE" | "AUCTION_FEE" | "FEATURED_LISTING" | "SUBSCRIPTION"; targetId: string };

/**
 * Payment method selection. The client never sends an amount — the server derives it.
 * Online methods redirect to the gateway; bank transfer shows instructions + UTR capture.
 */
export function PaymentForm({ target, methods, amount, cta = "Pay" }: { target: Target; methods: string[]; amount: number; cta?: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [method, setMethod] = useState(methods[0] ?? "UPI");
  const [busy, setBusy] = useState(false);
  const [bank, setBank] = useState<null | { paymentId: string; reference: string; details: string; amount: number }>(null);
  const [utr, setUtr] = useState("");

  async function pay() {
    setBusy(true);
    const { data, error } = await api<{ paymentId: string; reference: string; amount: number; redirectUrl: string | null; offline: boolean; bankDetails: string | null; clientPayload: Record<string, unknown> | null }>("/api/payments/initiate", { body: { ...target, method } });
    setBusy(false);
    if (error) return push({ tone: "error", title: error.message });
    if (data!.offline) return setBank({ paymentId: data!.paymentId, reference: data!.reference, details: data!.bankDetails ?? "", amount: data!.amount });
    if (data!.redirectUrl) return router.push(data!.redirectUrl);
    push({ tone: "info", title: "Opening secure checkout…", body: "Client checkout SDK integration is pending for this gateway." });
  }
  async function submitUtr() {
    if (!bank) return;
    setBusy(true);
    const { error } = await api(`/api/payments/${bank.paymentId}/utr`, { body: { utr } });
    setBusy(false);
    if (error) return push({ tone: "error", title: error.message });
    push({ tone: "success", title: "Transfer details submitted", body: "Our finance team will confirm once the funds are received." });
    router.refresh();
    setBank(null);
  }

  if (bank)
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-[14px] text-blue-900">
          <div className="font-bold">Transfer {formatINR(bank.amount)} to:</div>
          <div className="mt-1">{bank.details}</div>
          <div className="mt-2 flex items-center gap-2">Reference: <code className="rounded bg-white px-2 py-0.5 font-mono font-bold">{bank.reference}</code>
            <button onClick={() => navigator.clipboard?.writeText(bank.reference)} aria-label="Copy reference"><Copy className="h-4 w-4" /></button>
          </div>
          <p className="mt-2 text-[12.5px]">Use the reference in the transfer remarks. Payment is confirmed only after our team reconciles it with the bank statement.</p>
        </div>
        <div className="flex gap-2">
          <Input value={utr} onChange={(e) => setUtr(e.target.value.toUpperCase())} placeholder="UTR / transaction reference" aria-label="UTR number" />
          <Button onClick={submitUtr} loading={busy} disabled={utr.length < 8}>Submit</Button>
        </div>
      </div>
    );

  return (
    <div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-[13px] font-semibold text-slate-700">Choose a payment method</legend>
        {methods.map((m) => {
          const M = METHODS[m];
          if (!M) return null;
          return (
            <label key={m} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition", method === m ? "border-ink-900 bg-slate-50 ring-1 ring-ink-900" : "border-slate-200 hover:border-slate-300")}>
              <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="accent-ignite-500" />
              <M.icon className="h-5 w-5 text-slate-500" />
              <span>
                <span className="block text-[14px] font-semibold text-ink-900">{M.label}</span>
                <span className="block text-[12px] text-slate-500">{M.sub}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <Button size="xl" block className="mt-4" onClick={pay} loading={busy}>{cta} {formatINR(amount)}</Button>
      <p className="mt-2 text-center text-[12px] text-slate-500">Payments are confirmed only after verification with the payment provider.</p>
    </div>
  );
}
