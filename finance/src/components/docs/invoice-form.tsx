"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { GST_RATES, STATES } from "@/config/tax";
import { computeInvoice } from "@/lib/doc-math";
import { inr } from "@/lib/format";
import { createInvoiceAction } from "@/app/actions/documents";
import { PartyDialog } from "./party-dialog";

type Customer = { id: string; name: string; stateCode: string | null; creditDays: number; gstin: string | null };
type Item = { description: string; hsn: string; qty: string; unit: string; rate: string; gstRate: number };
const blank: Item = { description: "", hsn: "", qty: "1", unit: "Nos", rate: "", gstRate: 18 };
const addDays = (iso: string, d: number) => new Date(new Date(iso + "T00:00:00Z").getTime() + d * 86400000).toISOString().slice(0, 10);

export function InvoiceForm({ customers: initial, companyState, gstRegistered }: { customers: Customer[]; companyState: string; gstRegistered: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [customers, setCustomers] = useState(initial);
  const today = new Date().toISOString().slice(0, 10);
  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(today);
  const [due, setDue] = useState(addDays(today, 30));
  const [pos, setPos] = useState(companyState);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([{ ...blank }]);
  const party = customers.find((c) => c.id === partyId);

  const calc = useMemo(() => computeInvoice(companyState, pos, items.map((i) => ({ description: i.description, hsn: i.hsn, qty: Number(i.qty) || 0, ratePaise: Math.round((Number(i.rate) || 0) * 100), gstRate: gstRegistered ? i.gstRate : 0 }))), [items, pos, companyState, gstRegistered]);
  const setItem = (i: number, p: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const pickParty = (id: string, list = customers) => {
    setPartyId(id);
    const c = list.find((x) => x.id === id);
    if (c?.stateCode) setPos(c.stateCode);
    if (c) setDue(addDays(date, c.creditDays));
  };

  const submit = () => start(async () => {
    const r = await createInvoiceAction({
      partyId, date, dueDate: due, placeOfSupply: pos, notes: notes || undefined,
      items: items.map((i) => ({ description: i.description.trim(), hsn: i.hsn.trim() || undefined, qty: Number(i.qty), unit: i.unit || "Nos", ratePaise: Math.round(Number(i.rate) * 100), gstRate: gstRegistered ? i.gstRate : 0 })),
    });
    if (!r.ok) return void toast.error(r.error);
    toast.success(`Invoice ${r.data.number} created and posted`);
    router.push(`/invoices/${r.data.id}`);
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="grid gap-5 p-5 md:p-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Label>Customer
            <Select value={partyId} onChange={(e) => pickParty(e.target.value)} required data-testid="invoice-customer">
              <option value="">Choose customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.gstin ? "" : " (no GSTIN)"}</option>)}
            </Select>
          </Label>
          <PartyDialog kind="CUSTOMER" trigger={<Button type="button" variant="outline" className="self-end"><UserPlus /> New customer</Button>}
            onCreated={(p) => { const next = [...customers, { id: p.id, name: p.name, stateCode: p.stateCode, creditDays: p.creditDays, gstin: null }]; setCustomers(next); pickParty(p.id, next); }} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Label>Invoice date<Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDue(addDays(e.target.value, party?.creditDays ?? 30)); }} /></Label>
          <Label>Due date<Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Label>
          <Label>Place of supply<Select value={pos} onChange={(e) => setPos(e.target.value)}>{Object.entries(STATES).map(([c, s]) => <option key={c} value={c}>{c} · {s}</option>)}</Select></Label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="smallcaps text-left text-ink-3"><th className="pb-2 font-medium">Item</th><th className="w-24 pb-2 font-medium">HSN/SAC</th><th className="w-20 pb-2 font-medium">Qty</th><th className="w-20 pb-2 font-medium">Unit</th><th className="w-28 pb-2 font-medium">Rate ₹</th>{gstRegistered && <th className="w-24 pb-2 font-medium">GST</th>}<th className="w-28 pb-2 text-right font-medium">Taxable</th><th className="w-8" /></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-hairline">
                  <td className="py-2 pr-2"><Input aria-label="Item description" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="What did you sell?" /></td>
                  <td className="py-2 pr-2"><Input aria-label="HSN/SAC" value={it.hsn} onChange={(e) => setItem(i, { hsn: e.target.value })} /></td>
                  <td className="py-2 pr-2"><Input aria-label="Quantity" inputMode="decimal" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })} className="money" /></td>
                  <td className="py-2 pr-2"><Input aria-label="Unit" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} /></td>
                  <td className="py-2 pr-2"><Input aria-label="Rate" inputMode="decimal" value={it.rate} onChange={(e) => setItem(i, { rate: e.target.value })} className="money" /></td>
                  {gstRegistered && <td className="py-2 pr-2"><Select aria-label="GST rate" value={it.gstRate} onChange={(e) => setItem(i, { gstRate: Number(e.target.value) })}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</Select></td>}
                  <td className="money py-2 text-right">{inr(calc.lines[i]?.taxable ?? 0)}</td>
                  <td className="py-2 pl-1"><button type="button" aria-label="Remove item" disabled={items.length === 1} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} className="rounded-full p-1.5 text-ink-3 hover:bg-sand disabled:opacity-30"><Trash2 className="size-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={() => setItems((xs) => [...xs, { ...blank }])} className="mt-2 inline-flex items-center gap-1 text-sm text-gold hover:underline"><Plus className="size-4" />Add item</button>
        </div>
        <Label>Notes on invoice<Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Thank you for your business." /></Label>
      </Card>

      <Card className="grid h-fit gap-3 p-5 lg:sticky lg:top-24">
        <h2 className="text-lg">Summary</h2>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between"><dt className="text-ink-2">Taxable value</dt><dd className="money">{inr(calc.taxable)}</dd></div>
          {calc.interState ? (
            <div className="flex justify-between"><dt className="text-ink-2">IGST</dt><dd className="money">{inr(calc.igst)}</dd></div>
          ) : (<>
            <div className="flex justify-between"><dt className="text-ink-2">CGST</dt><dd className="money">{inr(calc.cgst)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">SGST</dt><dd className="money">{inr(calc.sgst)}</dd></div>
          </>)}
          {calc.roundOff !== 0 && <div className="flex justify-between"><dt className="text-ink-2">Round off</dt><dd className="money">{inr(calc.roundOff, { decimals: true })}</dd></div>}
          <div className="flex justify-between border-t border-hairline pt-2 text-base"><dt>Total</dt><dd className="money text-xl">{inr(calc.total)}</dd></div>
        </dl>
        <p className="text-xs text-ink-3">{calc.interState ? `Inter-state supply to ${STATES[pos]} — IGST applies.` : `Intra-state supply in ${STATES[pos]} — CGST + SGST.`}</p>
        <Button size="lg" onClick={submit} disabled={pending || !partyId || calc.total <= 0 || items.some((i) => !i.description.trim())} data-testid="create-invoice">Create &amp; post invoice</Button>
      </Card>
    </div>
  );
}
