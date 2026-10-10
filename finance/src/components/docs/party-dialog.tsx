"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { STATES, TDS_SECTIONS } from "@/config/tax";
import { validateGstin, validatePan } from "@/lib/accounting/core";
import { createPartyAction, updatePartyAction } from "@/app/actions/documents";

export interface PartyValues { name: string; kind: "CUSTOMER" | "VENDOR" | "BOTH"; gstin?: string | null; pan?: string | null; stateCode?: string | null; email?: string | null; phone?: string | null; address?: string | null; creditDays: number; tdsSection?: string | null }
export interface CreatedParty { id: string; name: string; stateCode: string | null; creditDays: number; tdsSection: string | null }

/** Create or edit a customer/vendor, with live GSTIN and PAN checks. */
export function PartyDialog({ trigger, kind = "CUSTOMER", edit, onCreated }: { trigger: React.ReactNode; kind?: PartyValues["kind"]; edit?: { id: string; values: PartyValues }; onCreated?: (p: CreatedParty) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const v = edit?.values;
  const [gstin, setGstin] = useState(v?.gstin ?? "");
  const [pan, setPan] = useState(v?.pan ?? "");
  const [state, setState] = useState(v?.stateCode ?? "27");
  const g = gstin ? validateGstin(gstin) : null;
  const panOk = !pan || validatePan(pan);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={edit ? `Edit ${v!.name}` : "Add party"} description="GSTIN fills the state and PAN for you.">
        <form className="grid gap-3" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const values = {
            name: String(f.get("name") ?? v?.name), kind: String(f.get("kind")) as PartyValues["kind"], gstin, pan, stateCode: state,
            email: String(f.get("email") || ""), phone: String(f.get("phone") || ""), address: String(f.get("address") || ""),
            creditDays: Number(f.get("creditDays") || 0), tdsSection: String(f.get("tdsSection") || ""),
          };
          start(async () => {
            const r = edit ? await updatePartyAction(edit.id, values) : await createPartyAction(values);
            if (!r.ok) return void toast.error(r.error);
            toast.success(edit ? "Saved" : `Added ${values.name}`);
            if (!edit && r.data && onCreated) onCreated(r.data as CreatedParty);
            setOpen(false);
          });
        }}>
          {!edit && <Label>Name<Input name="name" required autoFocus /></Label>}
          <div className="grid grid-cols-2 gap-3">
            <Label>Type<Select name="kind" defaultValue={v?.kind ?? kind}><option value="CUSTOMER">Customer</option><option value="VENDOR">Vendor</option><option value="BOTH">Both</option></Select></Label>
            <Label>Credit days<Input name="creditDays" type="number" min={0} max={365} defaultValue={v?.creditDays ?? 30} /></Label>
          </div>
          <Label>GSTIN
            <Input value={gstin} maxLength={15} className="uppercase" aria-invalid={g ? !g.ok : undefined}
              onChange={(e) => { const x = e.target.value.toUpperCase(); setGstin(x); if (x.length === 15 && validateGstin(x).ok) { setState(x.slice(0, 2)); if (!pan) setPan(x.slice(2, 12)); } }} />
            {g && !g.ok && <span className="text-danger">{g.reason}</span>}
            {g?.ok && <span className="text-mint-ink">Valid GSTIN · {STATES[gstin.slice(0, 2)]}</span>}
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <Label>PAN<Input value={pan} maxLength={10} className="uppercase" onChange={(e) => setPan(e.target.value.toUpperCase())} />{!panOk && <span className="text-danger">Format: ABCDE1234F</span>}</Label>
            <Label>State<Select value={state} onChange={(e) => setState(e.target.value)}>{Object.entries(STATES).map(([c, s]) => <option key={c} value={c}>{c} · {s}</option>)}</Select></Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Label>Email<Input name="email" type="email" defaultValue={v?.email ?? ""} /></Label>
            <Label>WhatsApp / phone<Input name="phone" defaultValue={v?.phone ?? ""} placeholder="+91…" /></Label>
          </div>
          <Label>Default TDS section (vendors)<Select name="tdsSection" defaultValue={v?.tdsSection ?? ""}><option value="">None</option>{TDS_SECTIONS.map((t) => <option key={t.section} value={t.section}>{t.section} · {t.label} · {t.rate}%</option>)}</Select></Label>
          <Label>Address<Input name="address" defaultValue={v?.address ?? ""} /></Label>
          <Button type="submit" disabled={pending || (g ? !g.ok : false) || !panOk}>{edit ? "Save changes" : "Add party"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
