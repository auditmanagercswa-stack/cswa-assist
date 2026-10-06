"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

export function InspectionForm({ vehicleId, inspectionId, checklist }: { vehicleId: string; inspectionId?: string; checklist: { key: string; label: string; weight: number }[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [ratings, setRatings] = useState<Record<string, number>>(Object.fromEntries(checklist.map((c) => [c.key, 8])));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [inspector, setInspector] = useState("AutoBidX Assured — Kochi");
  const [summary, setSummary] = useState("");
  const [odo, setOdo] = useState(true);
  const [busy, setBusy] = useState(false);
  const total = checklist.reduce((s, c) => s + c.weight, 0);
  const score = Math.round((checklist.reduce((s, c) => s + (ratings[c.key] / 10) * c.weight, 0) / total) * 100);
  async function save() {
    setBusy(true);
    const { data, error } = await api<{ score: number }>(`/api/admin/vehicles/${vehicleId}/inspection`, {
      body: { inspectionId, inspectorName: inspector, summary, odometerVerified: odo, items: checklist.map((c) => ({ key: c.key, label: c.label, rating: ratings[c.key], notes: notes[c.key] || undefined })) },
    });
    setBusy(false);
    if (error) return push({ tone: "error", title: error.message });
    push({ tone: "success", title: `Inspection saved — ${data!.score}/100`, body: "Report and badge are now live on the listing." });
    router.refresh();
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Inspector / partner"><Input value={inspector} onChange={(e) => setInspector(e.target.value)} /></Field>
        <div className="rounded-xl bg-ink-900 px-4 py-2 text-center text-white"><div className="text-[11px] uppercase text-white/60">Score</div><div className="num text-2xl font-bold">{score}/100</div></div>
      </div>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {checklist.map((c) => (
          <div key={c.key}>
            <div className="flex items-center justify-between text-[13px]"><span className="font-semibold text-slate-700">{c.label}</span><span className="num font-bold">{ratings[c.key]}/10</span></div>
            <input type="range" min={0} max={10} value={ratings[c.key]} onChange={(e) => setRatings((r) => ({ ...r, [c.key]: Number(e.target.value) }))} className="w-full accent-ignite-500" aria-label={`${c.label} rating`} />
            <Input className="h-8 text-[13px]" placeholder="Notes (optional)" value={notes[c.key] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [c.key]: e.target.value }))} />
          </div>
        ))}
      </div>
      <Checkbox checked={odo} onChange={(e) => setOdo(e.target.checked)} label="Odometer reading verified against service records" />
      <Field label="Summary"><Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
      <Button onClick={save} loading={busy}>Publish inspection report</Button>
    </div>
  );
}
