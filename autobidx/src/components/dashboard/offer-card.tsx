"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatINR, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { StatusBadge } from "../ui/badge";
import { useToast } from "../ui/toast";
import { AuctionTimer } from "../auction/auction-timer";

export type OfferView = {
  id: string;
  status: string;
  amount: number;
  currentAmount: number;
  awaiting: "BUYER" | "SELLER";
  expiresAt: string;
  createdAt: string;
  message: string | null;
  vehicle: { title: string; href: string; expectedPrice: number; thumb: string | null };
  counterparty: string;
  counters: { by: "BUYER" | "SELLER"; amount: number; message: string | null; at: string }[];
};

export function OfferCard({ o, side }: { o: OfferView; side: "BUYER" | "SELLER" }) {
  const router = useRouter();
  const { push } = useToast();
  const [counter, setCounter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const open = o.status === "PENDING" || o.status === "COUNTERED";
  const myTurn = open && o.awaiting === side;
  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    const { data, error } = await api<{ orderId: string | null }>(`/api/offers/${o.id}`, { body: { action, ...extra } });
    setBusy(null);
    if (error) return push({ tone: "error", title: error.message });
    if (action === "accept" && data?.orderId) {
      push({ tone: "success", title: "Offer accepted — order created" });
      router.push(side === "BUYER" ? `/checkout/${data.orderId}` : `/dashboard/orders/${data.orderId}`);
      return;
    }
    push({ tone: "success", title: action === "counter" ? "Counter-offer sent" : action === "reject" ? "Offer declined" : "Offer withdrawn" });
    setCounter("");
    router.refresh();
  }
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {o.vehicle.thumb && <img src={o.vehicle.thumb} alt="" className="hidden h-20 w-28 shrink-0 rounded-lg object-cover sm:block" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={o.vehicle.href} className="block truncate font-bold text-ink-900 hover:text-ignite-600">{o.vehicle.title}</Link>
              <div className="text-[12.5px] text-slate-500">{side === "SELLER" ? "From" : "Seller"}: {o.counterparty} · asking {formatINR(o.vehicle.expectedPrice)}</div>
            </div>
            <StatusBadge status={o.status} />
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-1">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{o.status === "ACCEPTED" ? "Agreed price" : "Latest amount"}</div>
              <div className="num text-[22px] font-bold text-ink-900">{formatINR(o.currentAmount)}</div>
            </div>
            {open && <div className="text-[12.5px] text-slate-500">{myTurn ? <span className="font-semibold text-ignite-600">Your response needed</span> : "Waiting for the other party"} · expires in <AuctionTimer endAt={o.expiresAt} className="text-[12.5px]" compact /></div>}
          </div>
        </div>
      </div>
      <ol className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
        {o.counters.map((c, i) => (
          <li key={i} className={cn("flex items-start justify-between gap-3 text-[13px]", c.by === side ? "text-ink-900" : "text-slate-600")}>
            <span className="min-w-0"><b>{c.by === side ? "You" : c.by === "BUYER" ? "Buyer" : "Seller"}</b>{c.message ? ` — ${c.message}` : ""}</span>
            <span className="flex shrink-0 gap-3"><span className="text-[11.5px] text-slate-400" suppressHydrationWarning>{timeAgo(c.at)}</span><span className="num font-semibold">{formatINR(c.amount)}</span></span>
          </li>
        ))}
      </ol>
      {myTurn && (
        <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
          <Button size="sm" variant="success" loading={busy === "accept"} onClick={() => act("accept")}>Accept {formatINR(o.currentAmount)}</Button>
          <div className="flex flex-1 gap-2">
            <div className="relative flex-1"><span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-slate-400">₹</span><Input className="num h-8 pl-6 text-[13px]" inputMode="numeric" placeholder="Counter amount" value={counter} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); setCounter(n ? n.toLocaleString("en-IN") : ""); }} /></div>
            <Button size="sm" variant="dark" loading={busy === "counter"} disabled={!counter} onClick={() => act("counter", { amount: Number(counter.replace(/\D/g, "")) })}>Counter</Button>
          </div>
          <Button size="sm" variant="outline" loading={busy === "reject"} onClick={() => act("reject")}>Decline</Button>
        </div>
      )}
      {open && side === "BUYER" && !myTurn && <div className="mt-3 text-right"><Button size="sm" variant="ghost" loading={busy === "withdraw"} onClick={() => act("withdraw")}>Withdraw offer</Button></div>}
    </div>
  );
}
