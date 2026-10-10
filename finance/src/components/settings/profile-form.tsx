"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { STATES } from "@/config/tax";
import { saveProfileAction } from "@/app/actions/settings";

export interface ProfileValues { name: string; address: string | null; email: string | null; phone: string | null; gstin: string | null; pan: string | null; tan: string | null; stateCode: string; upiId: string | null; flags: string[]; legalType: "PROPRIETORSHIP" | "PARTNERSHIP" | "LLP" | "PRIVATE_LIMITED" }

export function ProfileForm({ v, canEdit }: { v: ProfileValues; canEdit: boolean }) {
  const [pending, start] = useTransition();
  return (
    <form className="grid gap-3" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const g = (k: string) => String(f.get(k) ?? "");
      start(async () => {
        const r = await saveProfileAction({ name: g("name"), address: g("address"), email: g("email"), phone: g("phone"), gstin: g("gstin"), pan: g("pan"), tan: g("tan"), stateCode: g("stateCode"), upiId: g("upiId"), pf: f.get("pf") === "on", pt: f.get("pt") === "on", legalType: g("legalType") as ProfileValues["legalType"] });
        if (r.ok) toast.success("Company details saved"); else toast.error(r.error);
      });
    }}>
      <fieldset disabled={!canEdit || pending} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Label>Business name<Input name="name" defaultValue={v.name} required /></Label>
          <Label>Constitution<Select name="legalType" defaultValue={v.legalType}><option value="PROPRIETORSHIP">Proprietorship</option><option value="PARTNERSHIP">Partnership firm</option><option value="LLP">LLP</option><option value="PRIVATE_LIMITED">Private limited company</option></Select></Label>
        </div>
        <Label>Address<Input name="address" defaultValue={v.address ?? ""} /></Label>
        <div className="grid gap-3 sm:grid-cols-3">
          <Label>GSTIN<Input name="gstin" defaultValue={v.gstin ?? ""} className="uppercase" maxLength={15} /></Label>
          <Label>PAN<Input name="pan" defaultValue={v.pan ?? ""} className="uppercase" maxLength={10} /></Label>
          <Label>TAN<Input name="tan" defaultValue={v.tan ?? ""} className="uppercase" maxLength={10} placeholder="Needed for TDS reminders" /></Label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Label>State<Select name="stateCode" defaultValue={v.stateCode}>{Object.entries(STATES).map(([c, s]) => <option key={c} value={c}>{c} · {s}</option>)}</Select></Label>
          <Label>Email<Input name="email" type="email" defaultValue={v.email ?? ""} /></Label>
          <Label>Phone<Input name="phone" defaultValue={v.phone ?? ""} /></Label>
        </div>
        <Label>UPI ID (for pay-now links and QR on invoices)<Input name="upiId" defaultValue={v.upiId ?? ""} placeholder="business@hdfcbank" /></Label>
        <div className="flex flex-wrap gap-5 text-sm text-ink-2">
          <label className="flex items-center gap-2"><input type="checkbox" name="pf" defaultChecked={v.flags.includes("pf")} className="accent-[var(--gold)]" /> PF / ESI reminders</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="pt" defaultChecked={v.flags.includes("pt")} className="accent-[var(--gold)]" /> Professional tax reminders</label>
        </div>
        {canEdit && <Button type="submit" className="w-fit">Save details</Button>}
      </fieldset>
    </form>
  );
}
