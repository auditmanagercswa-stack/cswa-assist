"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate, formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { PaymentForm } from "@/components/dashboard/payment-form";

export function ProfileForm({ initial, canEdit }: { initial: { description: string; addressLine: string; pincode: string }; canEdit: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await api("/api/dealers/me/profile", { method: "PATCH", body: f });
    setBusy(false);
    if (error) return push({ tone: "error", title: error.message });
    push({ tone: "success", title: "Profile updated" });
    router.refresh();
  }
  return (
    <fieldset disabled={!canEdit} className="space-y-4">
      <Field label="About your dealership" hint="Shown on your public dealer page"><Textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} /></Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <Field label="Address"><Input value={f.addressLine} onChange={(e) => setF({ ...f, addressLine: e.target.value })} /></Field>
        <Field label="Pincode"><Input value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value })} maxLength={6} /></Field>
      </div>
      <p className="text-[12.5px] text-slate-500">Legal name, PAN and GSTIN changes require re-verification — contact support.</p>
      {canEdit && <Button onClick={save} loading={busy}>Save profile</Button>}
    </fieldset>
  );
}

type Member = { id: string; userId: string; name: string; email: string; role: string; canBid: boolean; canList: boolean; active: boolean; lastLoginAt: string | null };

export function TeamManager({ members, canManage, selfUserId }: { members: Member[]; canManage: boolean; selfUserId: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", role: "STAFF", canBid: true, canList: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  async function add() {
    setBusy(true);
    const { data, error } = await api<{ tempPassword: string | null }>("/api/dealers/me/team", { body: f });
    setBusy(false);
    if (error) {
      setErrors(error.details?.fields ?? {});
      return push({ tone: "error", title: error.message });
    }
    setTemp(data?.tempPassword ?? null);
    push({ tone: "success", title: "Team member added", body: "They've been notified to set a password." });
    router.refresh();
  }
  async function update(id: string, patch: Partial<Member>) {
    const { error } = await api(`/api/dealers/me/team/${id}`, { method: "PATCH", body: patch });
    if (error) return push({ tone: "error", title: error.message });
    router.refresh();
  }
  return (
    <div>
      <div className="divide-y divide-slate-100">
        {members.map((m) => (
          <div key={m.id} className={cn("flex flex-wrap items-center justify-between gap-3 py-3", !m.active && "opacity-50")}>
            <div>
              <div className="flex items-center gap-2 font-semibold text-ink-900">{m.name}{m.userId === selfUserId && <Badge>You</Badge>}<Badge tone={m.role === "OWNER" ? "ink" : "neutral"}>{m.role.toLowerCase()}</Badge></div>
              <div className="text-[12.5px] text-slate-500">{m.email} · last login {m.lastLoginAt ? formatDate(m.lastLoginAt) : "never"}</div>
            </div>
            {canManage && m.userId !== selfUserId && m.role !== "OWNER" ? (
              <div className="flex flex-wrap items-center gap-3 text-[13px]">
                <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-ignite-500" checked={m.canBid} onChange={(e) => update(m.id, { canBid: e.target.checked })} />Can bid/buy</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-ignite-500" checked={m.canList} onChange={(e) => update(m.id, { canList: e.target.checked })} />Can list</label>
                <Button size="sm" variant="ghost" onClick={() => update(m.id, { active: !m.active })}>{m.active ? "Deactivate" : "Reactivate"}</Button>
              </div>
            ) : (
              <div className="text-[12.5px] text-slate-500">{m.canBid ? "Bid ✓" : "No bidding"} · {m.canList ? "List ✓" : "No listing"}</div>
            )}
          </div>
        ))}
      </div>
      {canManage && <Button className="mt-4" variant="dark" onClick={() => { setOpen(true); setTemp(null); }}><Plus className="h-4 w-4" />Add team member</Button>}
      <Modal open={open} onClose={() => setOpen(false)} title="Add team member" footer={temp === null ? <><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={add}>Add member</Button></> : <Button onClick={() => setOpen(false)}>Done</Button>}>
        {temp !== null ? (
          <div className="text-sm text-slate-600">Member added. They can sign in after using <b>Forgot password</b>.{temp && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-800">Development mode temporary password: <code className="font-bold">{temp}</code></div>}</div>
        ) : (
          <div className="space-y-3">
            <Field label="Full name" error={errors.name}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email" error={errors.email}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
              <Field label="Mobile" error={errors.phone}><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            </div>
            <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="STAFF">Staff</option><option value="MANAGER">Manager</option></Select></Field>
            <Checkbox checked={f.canBid} onChange={(e) => setF({ ...f, canBid: e.target.checked })} label="Can bid in auctions and buy vehicles" />
            <Checkbox checked={f.canList} onChange={(e) => setF({ ...f, canList: e.target.checked })} label="Can create and edit listings" />
          </div>
        )}
      </Modal>
    </div>
  );
}

export function PlanPicker({ plans, currentId, renewsAt, methods, canManage, enabled }: { plans: { id: string; code: string; name: string; price: number; priceWithGst: number; features: string[]; listingLimit: number | null }[]; currentId: string | null; renewsAt: string | null; methods: string[]; canManage: boolean; enabled: boolean }) {
  const [buy, setBuy] = useState<null | (typeof plans)[number]>(null);
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const current = p.id === currentId;
          return (
            <div key={p.id} className={cn("flex flex-col rounded-2xl border bg-white p-6 shadow-[var(--shadow-card)]", current ? "border-ink-900 ring-1 ring-ink-900" : "border-slate-200", p.code === "PREMIUM" && "bg-gradient-to-b from-white to-amber-50/50")}>
              <div className="flex items-center justify-between"><h3 className="font-sans text-xl font-bold text-ink-900">{p.name}</h3>{current && <Badge tone="ink">Current plan</Badge>}</div>
              <div className="mt-2"><span className="num text-3xl font-bold text-ink-900">{p.price ? formatINR(p.price) : "Free"}</span>{p.price > 0 && <span className="text-sm text-slate-500"> / month + GST</span>}</div>
              <ul className="mt-5 flex-1 space-y-2 text-[14px] text-slate-700">{p.features.map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-verified-500" />{x}</li>)}</ul>
              {current ? <div className="mt-5 text-[12.5px] text-slate-500">{renewsAt ? `Active until ${formatDate(renewsAt)}` : "No expiry"}</div> : p.price > 0 && canManage && enabled ? <Button className="mt-5" variant={p.code === "PREMIUM" ? "primary" : "dark"} onClick={() => setBuy(p)}>Upgrade to {p.name}</Button> : null}
            </div>
          );
        })}
      </div>
      {!enabled && <p className="mt-4 text-sm text-slate-500">Paid plans are not open for purchase yet.</p>}
      <Modal open={!!buy} onClose={() => setBuy(null)} title={`Upgrade to ${buy?.name}`}>
        {buy && (
          <>
            <p className="mb-4 text-sm text-slate-600">{formatINR(buy.price)} + GST = <b>{formatINR(buy.priceWithGst)}</b> for 30 days. Fee rules for your plan apply from activation.</p>
            <PaymentForm target={{ purpose: "SUBSCRIPTION", targetId: buy.id }} methods={methods} amount={buy.priceWithGst} />
          </>
        )}
      </Modal>
    </div>
  );
}

export function ChangePassword() {
  const { push } = useToast();
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function save() {
    if (f.next !== f.confirm) return setErrors({ confirm: "Passwords don't match" });
    setBusy(true);
    const { error } = await api("/api/auth/change-password", { body: { current: f.current, next: f.next } });
    setBusy(false);
    if (error) {
      setErrors(error.details?.fields ?? {});
      return push({ tone: "error", title: error.message });
    }
    setF({ current: "", next: "", confirm: "" });
    setErrors({});
    push({ tone: "success", title: "Password changed", body: "Other sessions have been signed out." });
  }
  return (
    <div className="max-w-md space-y-3">
      <Field label="Current password" error={errors.current}><Input type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field>
      <Field label="New password" error={errors.next} hint="At least 8 characters with letters and numbers"><Input type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
      <Field label="Confirm new password" error={errors.confirm}><Input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
      <Button onClick={save} loading={busy}>Update password</Button>
    </div>
  );
}
