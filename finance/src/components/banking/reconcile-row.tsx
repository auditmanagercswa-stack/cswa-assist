"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Link2, Plus, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { inr, fmtDate } from "@/lib/format";
import { createFromTxnAction, matchTxnAction, setTxnStatusAction } from "@/app/actions/banking";

export interface Suggestion { voucherId: string; number: string | null; date: string; narration: string; score: number }

export function ReconcileRow({ txn, suggestions, ledgers, canWrite }: { txn: { id: string; date: string; description: string; reference: string | null; amountPaise: number }; suggestions: Suggestion[]; ledgers: { id: string; name: string; group: string }[]; canWrite: boolean }) {
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [ledger, setLedger] = useState("");
  const [narr, setNarr] = useState(txn.description);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => start(async () => { const r = await fn(); if (!r.ok) toast.error((r as { error: string }).error); else toast.success(msg); });
  const groups = Object.entries(ledgers.reduce<Record<string, typeof ledgers>>((m, l) => ((m[l.group] ??= []).push(l), m), {}));
  return (
    <li className="grid gap-3 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{txn.description}</p>
          <p className="text-xs text-ink-3">{fmtDate(txn.date)}{txn.reference ? ` · ${txn.reference}` : ""}</p>
        </div>
        <span className={"money text-base " + (txn.amountPaise > 0 ? "text-mint-ink" : "")}>{txn.amountPaise > 0 ? "+" : "−"}{inr(Math.abs(txn.amountPaise))}</span>
      </div>
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          {suggestions.map((s) => (
            <Button key={s.voucherId} size="sm" variant="outline" disabled={pending} onClick={() => run(() => matchTxnAction(txn.id, s.voucherId), "Matched")} title={s.narration}>
              <Link2 /> Match {s.number} · {fmtDate(s.date)}
            </Button>
          ))}
          {!suggestions.length && <span className="text-xs text-ink-3">No book entry with this amount nearby.</span>}
          <Button size="sm" variant="ghost" onClick={() => setCreating((x) => !x)}><Plus /> Create entry</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setTxnStatusAction(txn.id, "IGNORED"), "Ignored")}><EyeOff /> Ignore</Button>
        </div>
      )}
      {creating && (
        <form className="flex flex-wrap items-center gap-2 rounded-2xl bg-sand p-3" onSubmit={(e) => { e.preventDefault(); run(() => createFromTxnAction(txn.id, ledger, narr), "Entry posted and matched"); }}>
          <Select value={ledger} onChange={(e) => setLedger(e.target.value)} className="h-9 w-auto min-w-52" aria-label="Counter ledger" required>
            <option value="">{txn.amountPaise > 0 ? "Money came from…" : "Money went to…"}</option>
            {groups.map(([g, ls]) => <optgroup key={g} label={g}>{ls.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>)}
          </Select>
          <Input value={narr} onChange={(e) => setNarr(e.target.value)} className="h-9 min-w-48 flex-1" aria-label="Narration" />
          <Button size="sm" disabled={pending || !ledger}>Post {txn.amountPaise > 0 ? "receipt" : "payment"}</Button>
        </form>
      )}
    </li>
  );
}
