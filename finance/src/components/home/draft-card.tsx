"use client";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Check, Sparkles, AlertTriangle, MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { inr } from "@/lib/format";
import { clarifyDraftAction, confirmDraftAction, discardDraftAction, type DraftView } from "@/app/actions/journal";

export interface LedgerOption { id: string; name: string; group: string }
type EditLine = { ledgerId: string; side: "DR" | "CR"; rupees: string };

const TYPES = ["PAYMENT", "RECEIPT", "JOURNAL", "SALES", "PURCHASE", "CONTRA"] as const;
const label = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

/** Editable draft voucher. Nothing posts until the user presses "Post entry". */
export function DraftCard({ draft, ledgers, onDone, onReplace }: { draft: DraftView; ledgers: LedgerOption[]; onDone: () => void; onReplace: (d: DraftView) => void }) {
  const [pending, start] = useTransition();
  const [date, setDate] = useState(draft.date);
  const [type, setType] = useState(draft.voucherType);
  const [narration, setNarration] = useState(draft.narration);
  const [lines, setLines] = useState<EditLine[]>(draft.lines.map((l) => ({ ledgerId: l.ledgerId, side: l.side, rupees: String(l.amountPaise / 100) })));
  const [answer, setAnswer] = useState("");

  const paise = (r: string) => Math.round(Number(r.replace(/,/g, "")) * 100) || 0;
  const { dr, cr } = useMemo(() => lines.reduce((t, l) => (l.side === "DR" ? { ...t, dr: t.dr + paise(l.rupees) } : { ...t, cr: t.cr + paise(l.rupees) }), { dr: 0, cr: 0 }), [lines]);
  const balanced = dr === cr && dr > 0 && lines.every((l) => l.ledgerId && paise(l.rupees) > 0);
  const grouped = useMemo(() => Object.entries(ledgers.reduce<Record<string, LedgerOption[]>>((m, l) => ((m[l.group] ??= []).push(l), m), {})), [ledgers]);
  const set = (i: number, patch: Partial<EditLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const conf = Math.round(draft.confidence * 100);

  const submit = (post: boolean) => start(async () => {
    const r = await confirmDraftAction(draft.voucherId, { date, type, narration, lines: lines.map((l) => ({ ledgerId: l.ledgerId, side: l.side, amountPaise: paise(l.rupees) })) }, post);
    if (!r.ok) return void toast.error(r.error);
    toast.success(post ? `Posted ${r.data.number}` : "Draft saved");
    onDone();
  });

  return (
    <div className="grid gap-4 rounded-3xl border border-gold/40 bg-card p-4 shadow-[var(--shadow-card)] md:p-5" data-testid="draft-card">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="gold"><Sparkles className="size-3" /> Draft · {draft.engine === "claude" ? "Claude" : "rules"}</Chip>
        <Chip tone={conf >= 75 ? "mint" : conf >= 55 ? "warn" : "danger"}>{conf}% sure</Chip>
        {draft.tds && <Chip>TDS {draft.tds.section} · {inr(draft.tds.amountPaise)}</Chip>}
        {draft.gst && <Chip>GST {draft.gst.rate}%</Chip>}
        <span className="ml-auto truncate text-xs text-ink-3" title={draft.input}>“{draft.input}”</span>
      </div>

      {draft.warnings.length > 0 && (
        <ul className="grid gap-1 rounded-2xl bg-warn-bg p-3 text-xs text-warn">
          {draft.warnings.map((w) => <li key={w} className="flex gap-2"><AlertTriangle className="size-3.5 shrink-0" />{w}</li>)}
        </ul>
      )}

      {draft.question && (
        <form className="flex flex-wrap items-center gap-2 rounded-2xl bg-sand p-3" onSubmit={(e) => {
          e.preventDefault();
          if (!answer.trim()) return;
          start(async () => { const r = await clarifyDraftAction(draft.voucherId, answer); if (!r.ok) return void toast.error(r.error); setAnswer(""); onReplace(r.data); });
        }}>
          <MessageCircleQuestion className="size-4 text-gold" />
          <span className="text-sm text-ink">{draft.question}</span>
          <Input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" className="h-9 min-w-40 flex-1" aria-label="Answer" />
          <Button size="sm" variant="outline" disabled={pending}>Re-draft</Button>
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr]">
        <label className="grid gap-1 text-xs text-ink-2">Date<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" /></label>
        <label className="grid gap-1 text-xs text-ink-2">Voucher<Select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="h-9">{TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></label>
        <label className="grid gap-1 text-xs text-ink-2">Narration<Input value={narration} onChange={(e) => setNarration(e.target.value)} className="h-9" /></label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead><tr className="smallcaps text-left text-ink-3"><th className="pb-2 font-medium">Ledger</th><th className="w-24 pb-2 font-medium">Dr/Cr</th><th className="w-36 pb-2 text-right font-medium">Amount ₹</th><th className="w-8" /></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t border-hairline">
                <td className="py-2 pr-2">
                  <Select aria-label={`Ledger line ${i + 1}`} value={l.ledgerId} onChange={(e) => set(i, { ledgerId: e.target.value })} className="h-9">
                    <option value="">Choose ledger…</option>
                    {grouped.map(([g, ls]) => <optgroup key={g} label={g}>{ls.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}
                  </Select>
                </td>
                <td className="py-2 pr-2">
                  <Select aria-label={`Side line ${i + 1}`} value={l.side} onChange={(e) => set(i, { side: e.target.value as "DR" | "CR" })} className="h-9"><option value="DR">Dr</option><option value="CR">Cr</option></Select>
                </td>
                <td className="py-2"><Input aria-label={`Amount line ${i + 1}`} inputMode="decimal" value={l.rupees} onChange={(e) => set(i, { rupees: e.target.value })} className="money h-9 text-right" /></td>
                <td className="py-2 pl-1">
                  <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length <= 2} className="rounded-full p-1.5 text-ink-3 hover:bg-sand disabled:opacity-30" aria-label="Remove line"><Trash2 className="size-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-hairline text-xs">
              <td className="pt-2"><button type="button" onClick={() => setLines((ls) => [...ls, { ledgerId: "", side: dr > cr ? "CR" : "DR", rupees: String(Math.abs(dr - cr) / 100 || "") }])} className="inline-flex items-center gap-1 text-gold hover:underline"><Plus className="size-3.5" />Add line</button></td>
              <td colSpan={2} className={"money pt-2 text-right " + (balanced ? "text-mint-ink" : "text-danger")}>Dr {inr(dr)} · Cr {inr(cr)} {balanced ? "· balanced" : "· not balanced"}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => submit(true)} disabled={!balanced || pending} data-testid="post-entry"><Check /> Post entry</Button>
        <Button variant="outline" onClick={() => submit(false)} disabled={pending}>Save as draft</Button>
        <Button variant="ghost" className="ml-auto" disabled={pending} onClick={() => start(async () => { const r = await discardDraftAction(draft.voucherId); if (!r.ok) return void toast.error(r.error); toast("Draft discarded"); onDone(); })}>Discard</Button>
      </div>
    </div>
  );
}
