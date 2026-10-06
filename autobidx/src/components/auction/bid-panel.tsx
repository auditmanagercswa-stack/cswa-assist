"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, BadgeCheck, Bot, CheckCircle2, Gavel, Info, Lock, TrendingUp, Trophy, Users } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatINR, timeAgo } from "@/lib/format";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { useToast } from "../ui/toast";
import { AuctionTimer } from "./auction-timer";
import { FeeBreakdown, type Breakdown } from "../vehicles/fee-breakdown";

export type Snapshot = {
  id: string;
  status: string;
  result: string | null;
  startAt: string;
  endAt: string;
  serverTime: string;
  startingBid: number;
  currentBid: number | null;
  minNext: number;
  bidIncrement: number;
  bidCount: number;
  bidderCount: number;
  extensionCount: number;
  extendTriggerSec: number;
  extendBySec: number;
  reserveVisible: boolean;
  reservePrice: number | null;
  hasReserve: boolean;
  reserveMet: boolean;
  leaderAlias: string | null;
  viewer: { isLeader: boolean; isWinner: boolean; hasBid: boolean; autoBidMax: number | null; alias: string } | null;
  bids: { id: string; amount: number; isAuto: boolean; at: string; alias: string; mine: boolean }[];
};

const parseAmount = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;
const fmtInput = (n: number) => (n ? n.toLocaleString("en-IN") : "");

export function BidPanel({
  initial,
  vehicleId,
  signedIn,
  blockReason,
  variant = "full",
  loginNext,
}: {
  initial: Snapshot;
  vehicleId: string;
  signedIn: boolean;
  blockReason: string | null;
  variant?: "full" | "compact";
  loginNext: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [snap, setSnap] = useState<Snapshot>(initial);
  const [amount, setAmount] = useState(fmtInput(initial.minNext));
  const [maxAmt, setMaxAmt] = useState("");
  const [flash, setFlash] = useState(0);
  const [confirm, setConfirm] = useState<null | { kind: "bid" | "auto"; amount: number }>(null);
  const [quote, setQuote] = useState<Breakdown | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const touched = useRef(false);

  const refresh = useCallback(async () => {
    const { data } = await api<Snapshot>(`/api/auctions/${initial.id}`);
    if (data) setSnap(data);
  }, [initial.id]);

  // Live updates over SSE. The server pushes authoritative state; we only render it.
  useEffect(() => {
    const es = new EventSource(`/api/auctions/${initial.id}/stream`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("snapshot", (e) => {
      const s = JSON.parse((e as MessageEvent).data) as Snapshot | null;
      if (s) setSnap(s);
    });
    es.addEventListener("auction.bid", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { currentBid: number; minNext: number; bidCount: number; bidderCount: number; endAt: string; extended: boolean; reserveMet: boolean; leaderAlias: string | null; bids: { id: string; amount: number; isAuto: boolean; at: string; alias: string }[] };
      setSnap((s) => ({
        ...s,
        currentBid: d.currentBid,
        minNext: d.minNext,
        bidCount: d.bidCount,
        bidderCount: d.bidderCount ?? s.bidderCount,
        endAt: d.endAt,
        reserveMet: d.reserveMet,
        leaderAlias: d.leaderAlias,
        bids: [...(d.bids ?? []).slice().reverse().map((b) => ({ ...b, mine: !!s.viewer && b.alias === s.viewer.alias })), ...s.bids.filter((x) => !(d.bids ?? []).some((b) => b.id === x.id))].slice(0, 25),
      }));
      setFlash((f) => f + 1);
      if (d.extended) push({ tone: "info", title: "Auction extended", body: "A last-minute bid extended the auction to keep it fair." });
    });
    es.addEventListener("auction.closed", () => refresh());
    es.addEventListener("auction.update", () => refresh());
    return () => es.close();
  }, [initial.id, push, refresh]);

  // Keep the suggested amount at the minimum unless the user typed their own.
  useEffect(() => {
    if (!touched.current || parseAmount(amount) < snap.minNext) {
      setAmount(fmtInput(snap.minNext));
      touched.current = false;
    }
  }, [snap.minNext]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = snap.status;
  const ended = status === "ENDED" || status === "CANCELLED";
  const scheduled = status === "SCHEDULED";
  const live = status === "LIVE";
  const v = snap.viewer;

  async function openConfirm(kind: "bid" | "auto") {
    setError(null);
    const value = parseAmount(kind === "bid" ? amount : maxAmt);
    if (!signedIn) return router.push(`/login?next=${encodeURIComponent(loginNext)}`);
    if (!value) return setError("Enter an amount.");
    if (kind === "bid" && value < snap.minNext) return setError(`Your bid must be at least ${formatINR(snap.minNext)}.`);
    setConfirm({ kind, amount: value });
    setQuote(null);
    const { data } = await api<Breakdown>(`/api/fees/quote?vehicleId=${vehicleId}&price=${value}`);
    if (data) setQuote(data);
  }

  async function submit() {
    if (!confirm) return;
    setBusy(true);
    const res =
      confirm.kind === "bid"
        ? await api<{ leading: boolean; message: string; currentBid: number; minNext: number; extended: boolean }>(`/api/auctions/${snap.id}/bids`, { body: { amount: confirm.amount } })
        : await api<{ leading: boolean; currentBid: number; minNext: number; maxAmount: number }>(`/api/auctions/${snap.id}/autobid`, { body: { maxAmount: confirm.amount } });
    setBusy(false);
    setConfirm(null);
    if (res.error) {
      const minNext = (res.error.details as { minNext?: number } | undefined)?.minNext;
      if (minNext) setSnap((s) => ({ ...s, minNext }));
      setError(res.error.message);
      push({ tone: "error", title: res.error.message });
      if (res.error.code === "UNAUTHENTICATED") router.push(`/login?next=${encodeURIComponent(loginNext)}`);
      return;
    }
    touched.current = false;
    if (confirm.kind === "bid") {
      const d = res.data as { leading: boolean; message: string };
      push({ tone: d.leading ? "success" : "info", title: d.leading ? "Bid placed successfully." : "Bid placed — but you've been outbid", body: d.leading ? "You're the highest bidder." : d.message });
    } else {
      const d = res.data as { leading: boolean };
      push({ tone: "success", title: "Auto-bid set", body: d.leading ? "You're leading. We'll bid for you up to your maximum." : "Your maximum is below a competing auto-bid." });
      setMaxAmt("");
    }
    refresh();
  }

  async function cancelAuto() {
    const { error } = await api(`/api/auctions/${snap.id}/autobid`, { method: "DELETE" });
    if (error) push({ tone: "error", title: error.message });
    else {
      push({ tone: "success", title: "Auto-bid cancelled" });
      refresh();
    }
  }

  const quick = [snap.minNext, snap.minNext + snap.bidIncrement, snap.minNext + snap.bidIncrement * 4];

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-white shadow-[var(--shadow-card)]">
      {/* Status strip */}
      <div className={cn("flex items-center justify-between gap-2 rounded-t-[var(--radius-card)] px-5 py-3 text-[13px] font-semibold", live ? "bg-ink-900 text-white" : scheduled ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-700")}>
        <span className="flex items-center gap-2">
          {live ? <><span className="h-2 w-2 animate-pulse-soft rounded-full bg-ignite-500" /> Live auction</> : scheduled ? "Auction scheduled" : status === "CANCELLED" ? "Auction cancelled" : "Auction has ended"}
          {live && <span className={cn("ml-1 hidden text-[11px] font-medium sm:inline", connected ? "text-emerald-300" : "text-white/50")}>{connected ? "● real-time" : "○ connecting…"}</span>}
        </span>
        {!ended && <AuctionTimer key={snap.endAt} endAt={snap.endAt} startAt={scheduled ? snap.startAt : undefined} serverTime={snap.serverTime} className={live ? "text-white" : ""} onEnd={() => setTimeout(refresh, 1500)} />}
      </div>

      <div className="p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">{snap.currentBid ? (ended ? "Final bid" : "Current bid") : "Starting bid"}</div>
            <div key={flash} className={cn("num -mx-1 rounded px-1 text-[34px] font-bold leading-tight text-ink-900", flash > 0 && "animate-flash")}>{formatINR(snap.currentBid ?? snap.startingBid)}</div>
          </div>
          <div className="text-right text-[12.5px] text-slate-500">
            <div className="flex items-center justify-end gap-1"><Gavel className="h-3.5 w-3.5" />{snap.bidCount} bids</div>
            <div className="flex items-center justify-end gap-1"><Users className="h-3.5 w-3.5" />{snap.bidderCount} bidders</div>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
          <div className="rounded-lg bg-slate-50 p-2.5">
            <dt className="text-slate-500">Reserve price</dt>
            <dd className={cn("mt-0.5 font-semibold", snap.reserveMet ? "text-verified-600" : "text-amber-700")}>
              {!snap.hasReserve ? "No reserve" : snap.reserveVisible && snap.reservePrice ? `${formatINR(snap.reservePrice)} · ${snap.reserveMet ? "met" : "not met"}` : snap.reserveMet ? "Reserve met" : "Not yet met"}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-2.5">
            <dt className="text-slate-500">Bid increment</dt>
            <dd className="num mt-0.5 font-semibold text-ink-900">{formatINR(snap.bidIncrement)}</dd>
          </div>
        </dl>

        {v && live && (v.isLeader ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-verified-50 px-3 py-2.5 text-[13.5px] font-semibold text-verified-600"><CheckCircle2 className="h-4 w-4" />You&apos;re the highest bidder</div>
        ) : v.hasBid ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[13.5px] font-semibold text-red-700"><AlertCircle className="h-4 w-4" />You&apos;ve been outbid — bid again to stay in</div>
        ) : null)}
        {ended && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-[13.5px]">
            {v?.isWinner ? (
              <div className="flex items-start gap-2 font-semibold text-verified-600"><Trophy className="mt-0.5 h-4 w-4" /><span>You won this auction! <Link href="/dashboard/orders" className="underline">Complete payment</Link></span></div>
            ) : (
              <div className="text-slate-600">
                {snap.result === "WON" ? "Sold to the highest bidder." : snap.result === "RESERVE_NOT_MET" ? "Ended — reserve not met. The seller may still accept the highest bid." : snap.result === "SOLD_BUY_NOW" ? "Sold via Buy Now." : snap.result === "NO_BIDS" ? "Ended with no bids." : "This auction is closed."}
              </div>
            )}
          </div>
        )}

        {live && (
          blockReason ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13.5px] text-amber-800">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                {blockReason}
                {blockReason.includes("KYC") && <> <Link href="/dashboard/kyc" className="font-semibold underline">Complete KYC</Link></>}
              </div>
            </div>
          ) : (
            <div className="mt-5" id="place-bid">
              <label htmlFor={`bid-${snap.id}`} className="text-[13px] font-semibold text-slate-700">Your bid · minimum {formatINR(snap.minNext)}</label>
              <div className="mt-1.5 flex gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[17px] font-semibold text-slate-400">₹</span>
                  <input
                    ref={inputRef}
                    id={`bid-${snap.id}`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={amount}
                    onChange={(e) => {
                      touched.current = true;
                      setAmount(fmtInput(parseAmount(e.target.value)));
                      setError(null);
                    }}
                    className={cn("num h-14 w-full rounded-lg border bg-white pl-8 pr-3 text-[20px] font-bold text-ink-900 focus:outline-none focus:ring-2", error ? "border-red-400 focus:ring-red-200" : "border-slate-300 focus:border-ink-900 focus:ring-ink-900/10")}
                  />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {quick.map((q, i) => (
                  <button key={i} type="button" onClick={() => { touched.current = true; setAmount(fmtInput(q)); setError(null); }} className="num h-9 rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold text-ink-900 hover:border-ink-900">
                    {formatINR(q).replace("₹", "₹ ")}
                  </button>
                ))}
              </div>
              {error && <p className="mt-2 text-[13px] font-medium text-red-600" role="alert">{error}</p>}
              <Button size="xl" block className="mt-3 text-[16px] tracking-wide" onClick={() => openConfirm("bid")} disabled={v?.isLeader}>
                <Gavel className="h-5 w-5" /> {v?.isLeader ? "YOU'RE WINNING" : "PLACE BID"}
              </Button>

              {variant === "full" && (
                <div className="mt-5 rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 text-[14px] font-bold text-ink-900"><Bot className="h-4 w-4 text-ignite-600" />Auto-bid (proxy bidding)</div>
                  <p className="mt-1 text-[12.5px] text-slate-500">Set your maximum. We&apos;ll bid the minimum needed to keep you ahead — your maximum stays private.</p>
                  {v?.autoBidMax ? (
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-ignite-50 px-3 py-2 text-[13.5px]">
                      <span>Your max: <b className="num">{formatINR(v.autoBidMax)}</b></span>
                      <button onClick={cancelAuto} className="text-[12.5px] font-semibold text-ignite-700 underline">Cancel</button>
                    </div>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span>
                      <input inputMode="numeric" aria-label="Maximum auto-bid" placeholder={fmtInput(snap.minNext + snap.bidIncrement * 10)} value={maxAmt} onChange={(e) => setMaxAmt(fmtInput(parseAmount(e.target.value)))} className="num h-11 w-full rounded-lg border border-slate-300 pl-7 pr-3 font-semibold focus:border-ink-900 focus:outline-none" />
                    </div>
                    <Button variant="dark" size="lg" onClick={() => openConfirm("auto")}>{v?.autoBidMax ? "Update" : "Set max"}</Button>
                  </div>
                </div>
              )}
              <p className="mt-3 flex items-start gap-1.5 text-[12px] text-slate-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Bids are binding. A bid in the final {Math.round(snap.extendTriggerSec / 60)} min extends the auction by {Math.round(snap.extendBySec / 60)} min.
              </p>
            </div>
          )
        )}
        {!signedIn && live && !blockReason && <p className="mt-2 text-center text-[12.5px] text-slate-500"><Link href={`/login?next=${encodeURIComponent(loginNext)}`} className="font-semibold text-ink-900 underline">Sign in</Link> to bid. Only verified dealers can participate.</p>}

        {variant === "full" && (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-sans text-[14px] font-bold text-ink-900">Bid history</h3>
              <span className="text-[12px] text-slate-400">Bidders are anonymised</span>
            </div>
            {snap.bids.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-4 text-center text-[13px] text-slate-500">No bids yet — be the first.</p>
            ) : (
              <ol className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                {snap.bids.map((b, i) => (
                  <li key={b.id} className={cn("flex items-center justify-between gap-2 py-2.5 text-[13.5px]", i === 0 && "font-semibold")}>
                    <span className="flex min-w-0 items-center gap-2">
                      {i === 0 && !ended ? <TrendingUp className="h-4 w-4 shrink-0 text-verified-500" /> : <span className="h-4 w-4 shrink-0" />}
                      <span className={cn("truncate", b.mine ? "text-ignite-700" : "text-slate-700")}>{b.mine ? "You" : b.alias}</span>
                      {b.isAuto && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-500">auto</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-[11.5px] font-normal text-slate-400" suppressHydrationWarning>{timeAgo(b.at)}</span>
                      <span className="num text-ink-900">{formatINR(b.amount)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>

      {/* Mobile sticky bid bar */}
      {variant === "full" && live && !blockReason && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div>
            <div className="text-[11px] font-semibold uppercase text-slate-400">Current bid</div>
            <div className="num text-[18px] font-bold text-ink-900">{formatINR(snap.currentBid ?? snap.startingBid)}</div>
          </div>
          <Button size="lg" onClick={() => { inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); inputRef.current?.focus(); }} disabled={v?.isLeader}>
            {v?.isLeader ? "Winning" : `Bid ${formatINR(snap.minNext)}`}
          </Button>
        </div>
      )}

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === "auto" ? "Confirm auto-bid" : "Confirm your bid"}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submit} loading={busy}>{confirm?.kind === "auto" ? "Set auto-bid" : `Bid ${confirm ? formatINR(confirm.amount) : ""}`}</Button>
          </>
        }
      >
        {confirm && (
          <div>
            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{confirm.kind === "auto" ? "Your maximum" : "Your bid"}</div>
              <div className="num text-3xl font-bold text-ink-900">{formatINR(confirm.amount)}</div>
            </div>
            <div className="mt-4 text-[13px] font-semibold text-slate-700">If you win at this price, you&apos;ll pay:</div>
            {quote ? <FeeBreakdown b={quote} className="mt-1" priceLabel="Winning bid" /> : <div className="py-6 text-center text-sm text-slate-400">Calculating fees…</div>}
            <p className="mt-3 flex items-start gap-1.5 text-[12px] text-slate-500"><BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />Fees are calculated by AutoBidX servers from current fee rules. A winning bid is a binding commitment to buy.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
