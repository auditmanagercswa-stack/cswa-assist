"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { GST_RATES, TDS_SECTIONS } from "@/config/tax";
import { computeBill, suggestTds } from "@/lib/doc-math";
import { inr } from "@/lib/format";
import { createBillAction, readBillAction } from "@/app/actions/documents";
import { PartyDialog } from "./party-dialog";

type Vendor = { id: string; name: string; stateCode: string | null; creditDays: number; tdsSection: string | null; gstin: string | null };
const addDays = (iso: string, d: number) => new Date(new Date(iso + "T00:00:00Z").getTime() + d * 86400000).toISOString().slice(0, 10);

export function BillForm({ vendors: initial, ledgers, companyState, aiOn }: { vendors: Vendor[]; ledgers: { id: string; name: string; group: string }[]; companyState: string; aiOn: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reading, startRead] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [vendors, setVendors] = useState(initial);
  const [f, setF] = useState({ partyId: "", vendorBillNo: "", date: today, dueDate: addDays(today, 30), expenseLedgerId: "", description: "", hsn: "", taxable: "", gstRate: 18, reverseCharge: false, tdsSection: "", attachmentName: "" });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const vendor = vendors.find((v) => v.id === f.partyId);
  const taxablePaise = Math.round((Number(f.taxable) || 0) * 100);
  const calc = useMemo(() => computeBill(companyState, vendor?.stateCode, { taxablePaise, gstRate: f.gstRate, reverseCharge: f.reverseCharge, tdsSection: f.tdsSection || null }), [companyState, vendor, taxablePaise, f.gstRate, f.reverseCharge, f.tdsSection]);
  const suggestion = vendor?.tdsSection ? suggestTds(vendor.tdsSection, taxablePaise) : null;
  const grouped = Object.entries(ledgers.reduce<Record<string, typeof ledgers>>((m, l) => ((m[l.group] ??= []).push(l), m), {}));

  const pickVendor = (id: string, list = vendors) => {
    const v = list.find((x) => x.id === id);
    set({ partyId: id, tdsSection: v?.tdsSection ?? "", dueDate: addDays(f.date, v?.creditDays ?? 30) });
  };

  const read = (file?: File) => {
    if (!file) return;
    const form = new FormData(); form.set("file", file);
    startRead(async () => {
      const r = await readBillAction(form);
      if (fileRef.current) fileRef.current.value = "";
      if (!r.ok) return void toast.error(r.error);
      const d = r.data;
      if (d.vendorId) pickVendor(d.vendorId);
      set({ vendorBillNo: d.billNo ?? "", date: d.date ?? today, description: d.description ?? "", hsn: d.hsnSac ?? "", taxable: d.taxable != null ? String(d.taxable) : "", gstRate: d.gstRate ?? 18, attachmentName: d.fileName });
      toast.success(d.vendorId ? "Bill read — check the details" : `Bill read. Vendor ${d.vendorName ?? ""} ${d.vendorGstin ?? ""} isn't in Parties yet — add them.`);
    });
  };

  const submit = () => start(async () => {
    const r = await createBillAction({ partyId: f.partyId, vendorBillNo: f.vendorBillNo, date: f.date, dueDate: f.dueDate, expenseLedgerId: f.expenseLedgerId, description: f.description || undefined, hsn: f.hsn || undefined, taxablePaise, gstRate: f.gstRate, reverseCharge: f.reverseCharge, tdsSection: f.tdsSection || null, attachmentName: f.attachmentName || undefined });
    if (!r.ok) return void toast.error(r.error);
    toast.success("Bill recorded and posted");
    router.push("/payables");
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="grid gap-4 p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-gold/50 bg-sand p-3">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => read(e.target.files?.[0])} />
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={reading || !aiOn}>{reading ? <Loader2 className="animate-spin" /> : <Camera />} Photograph bill</Button>
          <span className="text-xs text-ink-2">{aiOn ? "We read vendor, bill number, date, HSN and amounts." : "Add ANTHROPIC_API_KEY to read bills from photos."}</span>
          {f.attachmentName && <Chip tone="gold">{f.attachmentName}</Chip>}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Label>Vendor<Select value={f.partyId} onChange={(e) => pickVendor(e.target.value)}><option value="">Choose vendor…</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Label>
          <PartyDialog kind="VENDOR" trigger={<Button type="button" variant="outline" className="self-end"><UserPlus /> New vendor</Button>}
            onCreated={(p) => { const next = [...vendors, { id: p.id, name: p.name, stateCode: p.stateCode, creditDays: p.creditDays, tdsSection: p.tdsSection, gstin: null }]; setVendors(next); pickVendor(p.id, next); }} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Label>Vendor bill no.<Input value={f.vendorBillNo} onChange={(e) => set({ vendorBillNo: e.target.value })} /></Label>
          <Label>Bill date<Input type="date" value={f.date} onChange={(e) => set({ date: e.target.value, dueDate: addDays(e.target.value, vendor?.creditDays ?? 30) })} /></Label>
          <Label>Due date<Input type="date" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></Label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label>Expense / asset ledger<Select value={f.expenseLedgerId} onChange={(e) => set({ expenseLedgerId: e.target.value })}><option value="">What is this bill for?</option>{grouped.map(([g, ls]) => <optgroup key={g} label={g}>{ls.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>)}</Select></Label>
          <Label>Description<Input value={f.description} onChange={(e) => set({ description: e.target.value })} /></Label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Label>Taxable value ₹<Input inputMode="decimal" value={f.taxable} onChange={(e) => set({ taxable: e.target.value })} className="money" /></Label>
          <Label>GST rate<Select value={f.gstRate} onChange={(e) => set({ gstRate: Number(e.target.value) })}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</Select></Label>
          <Label>HSN/SAC<Input value={f.hsn} onChange={(e) => set({ hsn: e.target.value })} /></Label>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={f.reverseCharge} onChange={(e) => set({ reverseCharge: e.target.checked })} className="accent-[var(--gold)]" /> Reverse charge applies (we pay the GST, e.g. GTA, legal services)</label>
        <Label>TDS section<Select value={f.tdsSection} onChange={(e) => set({ tdsSection: e.target.value })}><option value="">No TDS</option>{TDS_SECTIONS.map((t) => <option key={t.section} value={t.section}>{t.section} · {t.label} · {t.rate}%</option>)}</Select></Label>
        {suggestion && (
          <p className={"rounded-2xl p-3 text-sm " + (suggestion.belowThreshold ? "bg-sand text-ink-2" : "bg-gold-soft text-gold")}>
            Suggested: TDS u/s {suggestion.section} · {suggestion.label} · at {suggestion.rate}% = {inr(suggestion.amountPaise)}.
            {suggestion.belowThreshold ? " This bill alone is below the threshold — deduct only if the year's total payments to this vendor cross it." : ""}
          </p>
        )}
      </Card>
      <Card className="grid h-fit gap-3 p-5 lg:sticky lg:top-24">
        <h2 className="text-lg">Posting preview</h2>
        <dl className="grid gap-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-ink-2">Taxable</dt><dd className="money">{inr(taxablePaise)}</dd></div>
          {calc.interState ? <div className="flex justify-between"><dt className="text-ink-2">Input IGST</dt><dd className="money">{inr(calc.igst)}</dd></div> : <>
            <div className="flex justify-between"><dt className="text-ink-2">Input CGST</dt><dd className="money">{inr(calc.cgst)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Input SGST</dt><dd className="money">{inr(calc.sgst)}</dd></div></>}
          {f.reverseCharge && <div className="flex justify-between text-warn"><dt>RCM payable</dt><dd className="money">{inr(calc.tax)}</dd></div>}
          <div className="flex justify-between border-t border-hairline pt-1.5"><dt className="text-ink-2">Bill total</dt><dd className="money">{inr(calc.total)}</dd></div>
          {calc.tds > 0 && <div className="flex justify-between"><dt className="text-ink-2">Less TDS {f.tdsSection}</dt><dd className="money">−{inr(calc.tds)}</dd></div>}
          <div className="flex justify-between text-base"><dt>Payable to vendor</dt><dd className="money text-xl">{inr(calc.payable)}</dd></div>
        </dl>
        <Button size="lg" onClick={submit} disabled={pending || !f.partyId || !f.expenseLedgerId || !f.vendorBillNo || taxablePaise <= 0}>Record &amp; post bill</Button>
      </Card>
    </div>
  );
}
