"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { askAction } from "@/app/actions/ask";
import type { AskAnswer } from "@/lib/ai/ask";
import { inrCompact } from "@/lib/format";

const EXAMPLES = ["What did I spend on rent this quarter?", "Who owes me the most?", "How much GST do I owe this month?", "What's my profit this year?"];

/** Q&A over the books: answer, small chart and a link to the ledger behind it. */
export function AskPanel({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<{ q: string; a: AskAnswer }[]>([]);
  const [pending, start] = useTransition();
  const ask = (question: string) => {
    if (!question.trim()) return;
    start(async () => {
      const r = await askAction(question);
      if (!r.ok) return void toast.error(r.error);
      setItems((xs) => [{ q: question, a: r.data }, ...xs].slice(0, compact ? 2 : 10));
      setQ("");
    });
  };
  return (
    <div className="grid gap-4">
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex items-center gap-2 rounded-3xl bg-sand p-2 pl-4 focus-within:shadow-[0_0_0_2px_var(--gold)]">
        <label htmlFor={compact ? "ask-compact" : "ask-full"} className="sr-only">Ask about your books</label>
        <input id={compact ? "ask-compact" : "ask-full"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Who owes me the most?" className="min-w-0 flex-1 bg-transparent py-2 text-base text-ink placeholder:text-ink-3 focus:outline-none" data-testid="ask-input" />
        <Button type="submit" disabled={pending || !q.trim()}>{pending ? <Loader2 className="animate-spin" /> : null}Ask <ArrowRight /></Button>
      </form>
      {items.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e) => <button key={e} type="button" onClick={() => ask(e)} className="rounded-full border border-hairline bg-card px-3 py-1.5 text-xs text-ink-2 hover:border-gold hover:text-ink">{e}</button>)}
        </div>
      )}
      {items.map(({ q: question, a }, i) => (
        <div key={i} className="grid gap-3 rounded-3xl border border-hairline bg-card p-4" data-testid="ask-answer">
          <p className="text-xs text-ink-3">{question}</p>
          <p className="text-base leading-relaxed text-ink">{a.answer}</p>
          {a.chart && a.chart.data.length > 0 && (
            <figure>
              <figcaption className="smallcaps mb-2 text-ink-3">{a.chart.title}</figcaption>
              <div className="h-44 w-full">
                <ResponsiveContainer>
                  <BarChart data={a.chart.data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tickFormatter={(v: number) => inrCompact(v * 100)} tick={{ fontSize: 11, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip formatter={(v) => inrCompact(Number(v) * 100)} cursor={{ fill: "var(--sand)" }} contentStyle={{ borderRadius: 12, border: "1px solid var(--hairline)", background: "var(--card)" }} />
                    <Bar dataKey="value" fill="var(--gold)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </figure>
          )}
          <div className="flex items-center justify-between text-xs">
            {a.link ? <Link href={a.link.href} className="text-gold hover:underline">{a.link.label} →</Link> : <span />}
            <span className="text-ink-3">{a.engine === "claude" ? "Answered by Claude from your books" : "Answered from your books"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
