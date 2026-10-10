"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Camera, ArrowRight, Loader2, Undo2, PencilLine, Flame, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inr, fmtDate } from "@/lib/format";
import { draftEntryAction, loadDraftAction, ocrDraftAction, undoEntryAction, type DraftView } from "@/app/actions/journal";
import { DraftCard, type LedgerOption } from "./draft-card";
import type { HomeData } from "@/lib/dashboard";

const SUGGESTIONS = ["Received ₹1.2L from a customer", "Paid salaries for last month", "Bought stationery ₹1,800 in cash"];

export function RecordCard({ d, ledgers, canWrite, aiOn, askSlot }: { d: HomeData; ledgers: LedgerOption[]; canWrite: boolean; aiOn: boolean; askSlot: React.ReactNode }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<DraftView | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const run = (sentence: string) => {
    if (!sentence.trim()) return;
    start(async () => {
      const r = await draftEntryAction(sentence);
      if (!r.ok) return void toast.error(r.error);
      setDraft(r.data);
      setText("");
    });
  };

  const onPhoto = (f: File | undefined) => {
    if (!f) return;
    const form = new FormData();
    form.set("file", f);
    form.set("note", text);
    start(async () => {
      const r = await ocrDraftAction(form);
      if (fileRef.current) fileRef.current.value = "";
      if (!r.ok) return void toast.error(r.error);
      setDraft(r.data);
    });
  };

  return (
    <Card className="p-5 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="flex items-center gap-2 text-ink-2">
          <span className={"size-2 rounded-full " + (d.statusOk ? "bg-mint" : "bg-gold")} />
          {d.greeting} — {d.status}
        </p>
        <Chip tone="neutral" title={d.healthIssues.join(" · ") || "No issues"}>
          <HeartPulse className="size-3.5 text-gold" /> Health {d.health} · <Flame className="size-3.5 text-gold" /> {d.streak}-day streak
        </Chip>
      </div>

      <h1 className="mt-5 text-3xl leading-tight text-ink md:text-[2.6rem]">
        What <em className="text-gold">happened</em> in the business today?
      </h1>

      <Tabs defaultValue="record" className="mt-5">
        <TabsList><TabsTrigger value="record">Record</TabsTrigger><TabsTrigger value="ask">Ask your books</TabsTrigger></TabsList>

        <TabsContent value="record" className="mt-4 grid gap-4">
          {!canWrite ? (
            <p className="rounded-2xl bg-sand p-4 text-sm text-ink-2">You have read-only access. Ask the owner for accountant access to record entries.</p>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); run(text); }} className="rounded-3xl bg-sand p-3 transition-shadow duration-200 focus-within:shadow-[0_0_0_2px_var(--gold)]">
              <label htmlFor="record-input" className="sr-only">Describe what happened</label>
              <textarea id="record-input" data-testid="record-input" value={text} onChange={(e) => setText(e.target.value)} rows={3} disabled={pending}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(text); } }}
                placeholder="Paid office rent ₹25,000 from HDFC Bank for October"
                className="w-full resize-none bg-transparent p-2 text-base text-ink placeholder:text-ink-3 focus:outline-none" />
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
                <Button type="button" variant="outline" size="icon" aria-label="Photograph a bill or receipt" title={aiOn ? "Photograph a bill or receipt" : "Receipt reading needs an Anthropic API key"} onClick={() => fileRef.current?.click()} disabled={pending}>
                  <Camera />
                </Button>
                <span className="text-xs text-ink-3">Enter to draft · Shift+Enter for a new line</span>
                <Button type="submit" className="ml-auto" disabled={pending || !text.trim()} data-testid="draft-button">
                  {pending ? <Loader2 className="animate-spin" /> : null} Draft entry <ArrowRight />
                </Button>
              </div>
            </form>
          )}
          {canWrite && !draft && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => setText(s)} className="rounded-full border border-hairline bg-card px-3 py-1.5 text-xs text-ink-2 transition-colors duration-200 hover:border-gold hover:text-ink">{s}</button>
              ))}
            </div>
          )}
          {draft && <DraftCard key={draft.voucherId + draft.lines.length + draft.confidence} draft={draft} ledgers={ledgers} onDone={() => setDraft(null)} onReplace={setDraft} />}
        </TabsContent>

        <TabsContent value="ask" className="mt-4">{askSlot}</TabsContent>
      </Tabs>

      <section aria-labelledby="recent-title" className="mt-8">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="recent-title" className="text-lg">Recent entries</h2>
          <Link href="/reports/daybook" className="text-xs text-gold hover:underline">Day book</Link>
        </div>
        {d.recent.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-hairline p-6 text-center text-sm text-ink-2">Nothing recorded yet. Type your first entry above — something like “Received ₹50,000 from Sahyadri Retail into HDFC”.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {d.recent.map((v) => (
              <li key={v.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/vouchers/${v.id}`} className="truncate text-sm font-medium text-ink hover:underline">{v.narration || v.aiInput}</Link>
                    {v.status === "DRAFT" ? <Chip tone="warn">Draft</Chip> : v.reversed ? <Chip tone="danger">Undone</Chip> : <Chip tone="mint">{v.number}</Chip>}
                  </div>
                  <p className="truncate text-xs text-ink-3">{fmtDate(v.date)} · {v.lines.map((l) => `${l.side === "DR" ? "Dr" : "Cr"} ${l.ledger}`).join(" · ")}</p>
                </div>
                <span className="money text-sm">{inr(v.amount)}</span>
                {canWrite && v.status === "DRAFT" && (
                  <Button size="sm" variant="ghost" aria-label="Review draft" onClick={() => start(async () => { const r = await loadDraftAction(v.id); if (r.ok) setDraft(r.data); else toast.error(r.error); })}><PencilLine /></Button>
                )}
                {canWrite && v.status === "POSTED" && !v.reversed && (
                  <Button size="sm" variant="ghost" aria-label="Undo entry" title="Undo (posts a reversal)" onClick={() => start(async () => { const r = await undoEntryAction(v.id); if (r.ok) toast.success(`Reversed with ${r.data.number}`); else toast.error(r.error); })}><Undo2 /></Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}
