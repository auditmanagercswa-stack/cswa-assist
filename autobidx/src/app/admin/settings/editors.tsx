"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea, Toggle } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

function useSaver() {
  const router = useRouter();
  const { push } = useToast();
  return async (url: string, method: string, body: unknown, msg = "Saved") => {
    const { error } = await api(url, { method, body });
    if (error) {
      push({ tone: "error", title: error.message });
      return false;
    }
    push({ tone: "success", title: msg });
    router.refresh();
    return true;
  };
}

// ───────────────────────── Platform settings ─────────────────────────

type SettingItem = { key: string; group: string; label: string; value: unknown; isDefault: boolean; default: unknown };

export function SettingsEditor({ items }: { items: SettingItem[] }) {
  const groups = useMemo(() => [...new Set(items.map((i) => i.group))], [items]);
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <Card key={g}>
          <CardHeader title={g} />
          <div className="divide-y divide-slate-100">{items.filter((i) => i.group === g).map((i) => <SettingRow key={i.key} item={i} />)}</div>
        </Card>
      ))}
    </div>
  );
}

function SettingRow({ item }: { item: SettingItem }) {
  const save = useSaver();
  const [v, setV] = useState<unknown>(item.value);
  const [text, setText] = useState(() => (Array.isArray(item.value) || (typeof item.value === "object" && item.value !== null) ? JSON.stringify(item.value, null, 0) : String(item.value)));
  const [busy, setBusy] = useState(false);
  const isBool = typeof item.default === "boolean";
  const isNum = typeof item.default === "number";
  const isStrArray = Array.isArray(item.default) && (item.default as unknown[]).every((x) => typeof x === "string");
  const dirty = isBool ? v !== item.value : text !== (Array.isArray(item.value) || typeof item.value === "object" ? JSON.stringify(item.value) : String(item.value));
  async function commit(next?: unknown) {
    let value: unknown = next;
    if (value === undefined) {
      if (isNum) value = Number(text);
      else if (isStrArray) value = text.split(",").map((s) => s.trim()).filter(Boolean);
      else if (Array.isArray(item.default) || typeof item.default === "object") {
        try {
          value = JSON.parse(text);
        } catch {
          return void (await save("/api/admin/settings", "PUT", { key: item.key, value: "__invalid__" }));
        }
      } else value = text;
    }
    setBusy(true);
    await save("/api/admin/settings", "PUT", { key: item.key, value }, `Updated: ${item.label}`);
    setBusy(false);
  }
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[1fr_minmax(0,1.1fr)] sm:items-center">
      <div>
        <div className="text-[14px] font-semibold text-ink-900">{item.label}</div>
        <div className="font-mono text-[11px] text-slate-400">{item.key}{item.isDefault ? " · default" : ""}</div>
      </div>
      {isBool ? (
        <div className="flex justify-end">
          <button type="button" role="switch" aria-checked={!!v} aria-label={item.label} onClick={() => { setV(!v); commit(!v); }} className={cn("relative inline-flex h-6 w-11 rounded-full transition", v ? "bg-ignite-500" : "bg-slate-300")}>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", v ? "left-[22px]" : "left-0.5")} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          {item.key === "auction.incrementSlabs" || (typeof item.default === "object" && !isStrArray) ? <Textarea rows={2} className="font-mono text-[12px]" value={text} onChange={(e) => setText(e.target.value)} /> : <Input inputMode={isNum ? "numeric" : undefined} value={text} onChange={(e) => setText(e.target.value)} className={isStrArray ? "font-mono text-[12.5px]" : undefined} />}
          <Button size="sm" className="h-11" variant={dirty ? "primary" : "outline"} disabled={!dirty} loading={busy} onClick={() => commit()}>Save</Button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Fees ─────────────────────────

type Rule = { id: string; planId: string | null; plan: { code: string; name: string } | null; calcType: "FIXED" | "PERCENT"; fixedAmount: number; rateBps: number; minAmount: number | null; maxAmount: number | null; priceFrom: number | null; priceTo: number | null; gstApplicable: boolean; gstRateBps: number | null; active: boolean; priority: number };
type Fee = { id: string; code: string; name: string; description: string | null; payer: string; trigger: string; enabled: boolean; rules: Rule[] };

export function FeeEditor({ fees, plans }: { fees: Fee[]; plans: { id: string; name: string }[] }) {
  const save = useSaver();
  const [edit, setEdit] = useState<null | { fee: Fee; rule: Partial<Rule> & { id?: string } }>(null);
  const [preview, setPreview] = useState("600000");
  const describe = (r: Rule) => {
    const base = r.calcType === "PERCENT" ? `${r.rateBps / 100}%` : formatINR(r.fixedAmount);
    const caps = [r.minAmount != null ? `min ${formatINR(r.minAmount)}` : null, r.maxAmount != null ? `max ${formatINR(r.maxAmount)}` : null].filter(Boolean).join(", ");
    const slab = r.priceFrom != null || r.priceTo != null ? ` · price ${r.priceFrom != null ? formatINR(r.priceFrom) : "0"}–${r.priceTo != null ? formatINR(r.priceTo) : "∞"}` : "";
    return `${base}${caps ? ` (${caps})` : ""}${slab}${r.gstApplicable ? ` + GST${r.gstRateBps != null ? ` ${r.gstRateBps / 100}%` : ""}` : " · no GST"}`;
  };
  const price = Number(preview) || 0;
  const calc = (r: Rule) => {
    let a = r.calcType === "FIXED" ? r.fixedAmount : Math.round((price * r.rateBps) / 10000);
    if (r.minAmount != null) a = Math.max(a, r.minAmount);
    if (r.maxAmount != null) a = Math.min(a, r.maxAmount);
    return a;
  };
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
          <span className="text-slate-600">Preview default rules at vehicle price</span>
          <div className="relative w-40"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span><Input className="num h-9 pl-7" value={preview} onChange={(e) => setPreview(e.target.value.replace(/\D/g, ""))} /></div>
          <span className="text-[12px] text-slate-400">Preview is indicative; the server computes the authoritative amount (with plan overrides & GST).</span>
        </div>
      </Card>
      {fees.map((f) => (
        <Card key={f.id}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><h3 className="font-sans text-[16px] font-bold text-ink-900">{f.name}</h3><Badge tone={f.payer === "BUYER" ? "blue" : "violet"}>{f.payer.toLowerCase()} pays</Badge><Badge>{f.trigger.toLowerCase()}</Badge></div>
              <div className="font-mono text-[11px] text-slate-400">{f.code}</div>
              {f.description && <p className="mt-1 text-[13px] text-slate-500">{f.description}</p>}
            </div>
            <div className="w-56"><Toggle checked={f.enabled} onChange={(v) => save(`/api/admin/fees/${f.code}`, "PATCH", { enabled: v }, v ? "Fee enabled" : "Fee disabled")} label={f.enabled ? "Enabled" : "Disabled"} /></div>
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {f.rules.map((r) => (
              <li key={r.id} className={cn("flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13.5px]", !r.active && "opacity-50")}>
                <span><Badge tone={r.plan ? "orange" : "neutral"}>{r.plan ? `${r.plan.name} plan` : "Default"}</Badge> <span className="ml-1 text-ink-900">{describe(r)}</span>{!r.plan && f.trigger === "TRANSACTION" && price > 0 && <span className="ml-2 text-slate-400">→ {formatINR(calc(r))}</span>}</span>
                <span className="flex gap-1">
                  <button onClick={() => setEdit({ fee: f, rule: r })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Edit rule"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => confirm("Delete this rule?") && save(`/api/admin/fee-rules/${r.id}`, "DELETE", {}, "Rule deleted")} className="rounded p-1.5 text-red-500 hover:bg-red-50" aria-label="Delete rule"><Trash2 className="h-4 w-4" /></button>
                </span>
              </li>
            ))}
            {f.rules.length === 0 && <li className="px-3 py-2.5 text-[13px] text-slate-500">No rules — this fee is not charged.</li>}
          </ul>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setEdit({ fee: f, rule: { calcType: "PERCENT", fixedAmount: 0, rateBps: 100, gstApplicable: true, active: true, priority: 0, planId: null } })}><Plus className="h-4 w-4" />Add rule</Button>
        </Card>
      ))}
      {edit && <RuleModal fee={edit.fee} rule={edit.rule} plans={plans} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RuleModal({ fee, rule, plans, onClose }: { fee: Fee; rule: Partial<Rule> & { id?: string }; plans: { id: string; name: string }[]; onClose: () => void }) {
  const save = useSaver();
  const s = (v: number | null | undefined) => (v == null ? "" : String(v));
  const [f, setF] = useState({ planId: rule.planId ?? "", calcType: rule.calcType ?? "PERCENT", fixedAmount: s(rule.fixedAmount), ratePct: rule.rateBps != null ? String(rule.rateBps / 100) : "", minAmount: s(rule.minAmount), maxAmount: s(rule.maxAmount), priceFrom: s(rule.priceFrom), priceTo: s(rule.priceTo), gstApplicable: rule.gstApplicable ?? true, gstPct: rule.gstRateBps != null ? String(rule.gstRateBps / 100) : "", active: rule.active ?? true, priority: s(rule.priority ?? 0) });
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    const body = {
      feeCode: fee.code,
      planId: f.planId || null,
      calcType: f.calcType,
      fixedAmount: Number(f.fixedAmount || 0),
      rateBps: Math.round(Number(f.ratePct || 0) * 100),
      minAmount: f.minAmount === "" ? null : Number(f.minAmount),
      maxAmount: f.maxAmount === "" ? null : Number(f.maxAmount),
      priceFrom: f.priceFrom === "" ? null : Number(f.priceFrom),
      priceTo: f.priceTo === "" ? null : Number(f.priceTo),
      gstApplicable: f.gstApplicable,
      gstRateBps: f.gstPct === "" ? null : Math.round(Number(f.gstPct) * 100),
      active: f.active,
      priority: Number(f.priority || 0),
    };
    const ok = rule.id ? await save(`/api/admin/fee-rules/${rule.id}`, "PUT", body, "Rule updated") : await save("/api/admin/fee-rules", "POST", body, "Rule added");
    setBusy(false);
    if (ok) onClose();
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={`${rule.id ? "Edit" : "Add"} rule — ${fee.name}`} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Save rule</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Applies to"><Select value={f.planId} onChange={set("planId")}><option value="">All dealers (default)</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name} plan only</option>)}</Select></Field>
        <Field label="Calculation"><Select value={f.calcType} onChange={set("calcType")}><option value="PERCENT">Percentage of price</option><option value="FIXED">Fixed amount</option></Select></Field>
        {f.calcType === "PERCENT" ? <Field label="Rate (%)" hint="e.g. 0.5 for 0.5%"><Input inputMode="decimal" value={f.ratePct} onChange={set("ratePct")} /></Field> : <Field label="Amount (₹)"><Input inputMode="numeric" value={f.fixedAmount} onChange={set("fixedAmount")} /></Field>}
        <Field label="Priority" hint="Higher wins when several rules match"><Input inputMode="numeric" value={f.priority} onChange={set("priority")} /></Field>
        <Field label="Minimum fee (₹)"><Input inputMode="numeric" value={f.minAmount} onChange={set("minAmount")} placeholder="none" /></Field>
        <Field label="Maximum fee (₹)"><Input inputMode="numeric" value={f.maxAmount} onChange={set("maxAmount")} placeholder="none" /></Field>
        <Field label="Price slab from (₹)"><Input inputMode="numeric" value={f.priceFrom} onChange={set("priceFrom")} placeholder="any" /></Field>
        <Field label="Price slab to (₹, exclusive)"><Input inputMode="numeric" value={f.priceTo} onChange={set("priceTo")} placeholder="any" /></Field>
        <Field label="GST rate override (%)" hint="Blank = platform default"><Input inputMode="decimal" value={f.gstPct} onChange={set("gstPct")} disabled={!f.gstApplicable} /></Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <Checkbox checked={f.gstApplicable} onChange={(e) => setF({ ...f, gstApplicable: e.target.checked })} label="GST applicable" />
          <Checkbox checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} label="Active" />
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────── Plans ─────────────────────────

type Plan = { id: string; code: string; name: string; priceMonthly: number; listingLimit: number | null; featuredCredits: number; analytics: boolean; advancedAnalytics: boolean; prioritySupport: boolean; features: string[]; active: boolean; subscribers: number };

export function PlanEditor({ plans }: { plans: Plan[] }) {
  return <div className="grid gap-5 lg:grid-cols-3">{plans.map((p) => <PlanCard key={p.id} p={p} />)}</div>;
}

function PlanCard({ p }: { p: Plan }) {
  const save = useSaver();
  const [f, setF] = useState({ ...p, listingLimit: p.listingLimit == null ? "" : String(p.listingLimit), features: p.features.join("\n") });
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    await save(`/api/admin/plans/${p.id}`, "PUT", { name: f.name, priceMonthly: Number(f.priceMonthly), listingLimit: f.listingLimit === "" ? null : Number(f.listingLimit), featuredCredits: Number(f.featuredCredits), analytics: f.analytics, advancedAnalytics: f.advancedAnalytics, prioritySupport: f.prioritySupport, features: f.features.split("\n").map((x) => x.trim()).filter(Boolean), active: f.active }, `${f.name} plan saved`);
    setBusy(false);
  }
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between"><Badge tone="ink">{p.code}</Badge><span className="text-[12px] text-slate-500">{p.subscribers} active subscribers</span></div>
      <div className="space-y-3">
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price / month (₹)"><Input inputMode="numeric" value={f.priceMonthly} onChange={(e) => setF({ ...f, priceMonthly: Number(e.target.value.replace(/\D/g, "")) })} /></Field>
          <Field label="Listing limit" hint="blank = unlimited"><Input inputMode="numeric" value={f.listingLimit} onChange={(e) => setF({ ...f, listingLimit: e.target.value.replace(/\D/g, "") })} /></Field>
        </div>
        <Field label="Featured credits / month"><Input inputMode="numeric" value={f.featuredCredits} onChange={(e) => setF({ ...f, featuredCredits: Number(e.target.value.replace(/\D/g, "")) })} /></Field>
        <Checkbox checked={f.analytics} onChange={(e) => setF({ ...f, analytics: e.target.checked })} label="Analytics" />
        <Checkbox checked={f.advancedAnalytics} onChange={(e) => setF({ ...f, advancedAnalytics: e.target.checked })} label="Advanced analytics" />
        <Checkbox checked={f.prioritySupport} onChange={(e) => setF({ ...f, prioritySupport: e.target.checked })} label="Priority support" />
        <Checkbox checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} label="Available for purchase" />
        <Field label="Feature bullets (one per line)"><Textarea rows={4} value={f.features} onChange={(e) => setF({ ...f, features: e.target.value })} /></Field>
        <p className="text-[12px] text-slate-500">Plan-specific fee rates are set under Fees & commission → add a rule for this plan.</p>
        <Button block loading={busy} onClick={submit}>Save plan</Button>
      </div>
    </Card>
  );
}

// ───────────────────────── CMS ─────────────────────────

type Page = { id: string; slug: string; title: string; category: string; body: string; published: boolean; updatedAt: string };
type Faq = { id: string; question: string; answer: string; category: string; sortOrder: number; published: boolean };
type BannerT = { id: string; placement: string; title: string; subtitle: string | null; ctaLabel: string | null; ctaHref: string | null; active: boolean; sortOrder: number };

export function CmsEditor({ pages, faqs, banners }: { pages: Page[]; faqs: Faq[]; banners: BannerT[] }) {
  const save = useSaver();
  const [page, setPage] = useState<Partial<Page> | null>(null);
  const [faq, setFaq] = useState<Partial<Faq> | null>(null);
  const [banner, setBanner] = useState<Partial<BannerT> | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<boolean>, close: () => void) {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) close();
  }
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Pages" subtitle="Legal policies and help articles (Markdown: ## headings, - lists, **bold**, [links](/path))" action={<Button size="sm" variant="outline" onClick={() => setPage({ category: "HELP", published: true, body: "", slug: "", title: "" })}><Plus className="h-4 w-4" />New page</Button>} />
        <ul className="divide-y divide-slate-100 text-[14px]">
          {pages.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <span><b className="text-ink-900">{p.title}</b> <span className="font-mono text-[11.5px] text-slate-400">/pages/{p.slug}</span> <Badge>{p.category.toLowerCase()}</Badge>{!p.published && <Badge tone="amber">draft</Badge>}</span>
              <Button size="sm" variant="ghost" onClick={() => setPage(p)}><Pencil className="h-4 w-4" />Edit</Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="FAQs" action={<Button size="sm" variant="outline" onClick={() => setFaq({ category: "GENERAL", published: true, sortOrder: faqs.length, question: "", answer: "" })}><Plus className="h-4 w-4" />New FAQ</Button>} />
        <ul className="divide-y divide-slate-100 text-[14px]">
          {faqs.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 truncate"><b className="text-ink-900">{f.question}</b> <Badge>{f.category.toLowerCase()}</Badge></span>
              <span className="flex shrink-0">
                <Button size="sm" variant="ghost" onClick={() => setFaq(f)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => confirm("Delete this FAQ?") && save("/api/admin/cms/faqs", "DELETE", { id: f.id }, "FAQ deleted")}><Trash2 className="h-4 w-4 text-red-500" /></Button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Banners" subtitle="Homepage promo strip and dashboard announcements" action={<Button size="sm" variant="outline" onClick={() => setBanner({ placement: "HOME_PROMO", active: true, sortOrder: 0, title: "" })}><Plus className="h-4 w-4" />New banner</Button>} />
        <ul className="divide-y divide-slate-100 text-[14px]">
          {banners.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
              <span><b className="text-ink-900">{b.title}</b> <Badge>{b.placement.toLowerCase().replace("_", " ")}</Badge>{!b.active && <Badge tone="amber">inactive</Badge>}</span>
              <span className="flex">
                <Button size="sm" variant="ghost" onClick={() => setBanner(b)}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => confirm("Delete this banner?") && save("/api/admin/cms/banners", "DELETE", { id: b.id }, "Banner deleted")}><Trash2 className="h-4 w-4 text-red-500" /></Button>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {page && (
        <Modal open size="lg" onClose={() => setPage(null)} title={page.id ? `Edit: ${page.title}` : "New page"} footer={<><Button variant="outline" onClick={() => setPage(null)}>Cancel</Button><Button loading={busy} onClick={() => run(() => save("/api/admin/cms/pages", "POST", page, "Page saved"), () => setPage(null))}>Save page</Button></>}>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Title" className="sm:col-span-2"><Input value={page.title ?? ""} onChange={(e) => setPage({ ...page, title: e.target.value })} /></Field>
              <Field label="Category"><Select value={page.category} onChange={(e) => setPage({ ...page, category: e.target.value })}><option value="LEGAL">Legal</option><option value="HELP">Help</option><option value="INFO">Info</option></Select></Field>
            </div>
            <Field label="Slug" hint="URL: /pages/slug"><Input value={page.slug ?? ""} onChange={(e) => setPage({ ...page, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} disabled={!!page.id} /></Field>
            <Field label="Body (Markdown)"><Textarea rows={14} className="font-mono text-[13px]" value={page.body ?? ""} onChange={(e) => setPage({ ...page, body: e.target.value })} /></Field>
            <Checkbox checked={!!page.published} onChange={(e) => setPage({ ...page, published: e.target.checked })} label="Published" />
          </div>
        </Modal>
      )}
      {faq && (
        <Modal open onClose={() => setFaq(null)} title={faq.id ? "Edit FAQ" : "New FAQ"} footer={<><Button variant="outline" onClick={() => setFaq(null)}>Cancel</Button><Button loading={busy} onClick={() => run(() => save("/api/admin/cms/faqs", "POST", faq, "FAQ saved"), () => setFaq(null))}>Save</Button></>}>
          <div className="space-y-3">
            <Field label="Question"><Input value={faq.question ?? ""} onChange={(e) => setFaq({ ...faq, question: e.target.value })} /></Field>
            <Field label="Answer"><Textarea rows={5} value={faq.answer ?? ""} onChange={(e) => setFaq({ ...faq, answer: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category"><Input value={faq.category ?? ""} onChange={(e) => setFaq({ ...faq, category: e.target.value.toUpperCase() })} /></Field>
              <Field label="Order"><Input inputMode="numeric" value={faq.sortOrder ?? 0} onChange={(e) => setFaq({ ...faq, sortOrder: Number(e.target.value) || 0 })} /></Field>
            </div>
            <Checkbox checked={!!faq.published} onChange={(e) => setFaq({ ...faq, published: e.target.checked })} label="Published" />
          </div>
        </Modal>
      )}
      {banner && (
        <Modal open onClose={() => setBanner(null)} title={banner.id ? "Edit banner" : "New banner"} footer={<><Button variant="outline" onClick={() => setBanner(null)}>Cancel</Button><Button loading={busy} onClick={() => run(() => save("/api/admin/cms/banners", "POST", banner, "Banner saved"), () => setBanner(null))}>Save</Button></>}>
          <div className="space-y-3">
            <Field label="Placement"><Select value={banner.placement} onChange={(e) => setBanner({ ...banner, placement: e.target.value })}><option value="HOME_PROMO">Homepage promo</option><option value="HOME_HERO">Homepage hero</option><option value="DASHBOARD">Dealer dashboard</option></Select></Field>
            <Field label="Title"><Input value={banner.title ?? ""} onChange={(e) => setBanner({ ...banner, title: e.target.value })} /></Field>
            <Field label="Subtitle"><Input value={banner.subtitle ?? ""} onChange={(e) => setBanner({ ...banner, subtitle: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Button label"><Input value={banner.ctaLabel ?? ""} onChange={(e) => setBanner({ ...banner, ctaLabel: e.target.value })} /></Field>
              <Field label="Button link" hint="/path or https://"><Input value={banner.ctaHref ?? ""} onChange={(e) => setBanner({ ...banner, ctaHref: e.target.value })} /></Field>
            </div>
            <Checkbox checked={!!banner.active} onChange={(e) => setBanner({ ...banner, active: e.target.checked })} label="Active" />
          </div>
        </Modal>
      )}
    </div>
  );
}
