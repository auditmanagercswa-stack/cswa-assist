"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { humanize } from "@/lib/format";
import { Modal } from "../ui/modal";
import { Button } from "../ui/button";

type Opt = { id: string; name: string; slug: string };
const FUELS = ["PETROL", "DIESEL", "CNG", "ELECTRIC", "HYBRID", "LPG"];
const TRANS = ["MANUAL", "AUTOMATIC", "AMT", "CVT", "DCT"];
const BODIES = ["HATCHBACK", "SEDAN", "SUV", "MUV", "COUPE", "CONVERTIBLE", "PICKUP", "COMMERCIAL"];
const CONDS = ["EXCELLENT", "GOOD", "FAIR", "POOR"];
const PRICES = [100000, 200000, 300000, 500000, 800000, 1000000, 1500000, 2000000, 3000000, 5000000, 10000000];
const KMS = [10000, 30000, 50000, 75000, 100000, 150000];
const YEARS = Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i);
const priceLabel = (p: number) => (p >= 1e7 ? `₹${p / 1e7} Cr` : p >= 1e5 ? `₹${p / 1e5} L` : `₹${p / 1e3}K`);

function useFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const get = (k: string) => sp.get(k) ?? "";
  const getList = (k: string) => (sp.get(k) ?? "").split(",").filter(Boolean);
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const toggleList = (k: string, v: string) => {
    const list = getList(k);
    const nl = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
    set({ [k]: nl.join(",") || null });
  };
  return { get, getList, set, toggleList, pending, sp };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-200 py-4 last:border-0">
      <div className="mb-2.5 text-[12px] font-bold uppercase tracking-wider text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cn("rounded-full border px-3 py-1.5 text-[13px] font-semibold transition", on ? "border-ink-900 bg-ink-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-ink-900")}>
      {children}
    </button>
  );
}

const sel = "h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-[14px] text-ink-900 focus:border-ink-900 focus:outline-none";

function Panel({ makes, states }: { makes: Opt[]; states: Opt[] }) {
  const f = useFilters();
  const [models, setModels] = useState<Opt[]>([]);
  const [districts, setDistricts] = useState<Opt[]>([]);
  const make = f.get("make");
  const state = f.get("state");
  useEffect(() => {
    if (!make) return setModels([]);
    api<{ items: Opt[] }>(`/api/catalog/models?make=${make}`).then(({ data }) => setModels(data?.items ?? []));
  }, [make]);
  useEffect(() => {
    if (!state) return setDistricts([]);
    api<{ items: Opt[] }>(`/api/locations/districts?state=${state}`).then(({ data }) => setDistricts(data?.items ?? []));
  }, [state]);

  return (
    <div className={cn("transition-opacity", f.pending && "opacity-60")}>
      <Section title="Sale type">
        <div className="flex flex-wrap gap-2">
          <Chip on={f.get("auction") === "live"} onClick={() => f.set({ auction: f.get("auction") === "live" ? null : "live" })}>Live auction</Chip>
          <Chip on={f.get("auction") === "upcoming"} onClick={() => f.set({ auction: f.get("auction") === "upcoming" ? null : "upcoming" })}>Upcoming</Chip>
          <Chip on={f.get("buyNow") === "true"} onClick={() => f.set({ buyNow: f.get("buyNow") ? null : "true" })}>Buy Now</Chip>
          <Chip on={f.get("inspected") === "true"} onClick={() => f.set({ inspected: f.get("inspected") ? null : "true" })}>Inspected</Chip>
        </div>
      </Section>
      <Section title="Make & model">
        <div className="space-y-2">
          <select aria-label="Make" className={sel} value={make} onChange={(e) => f.set({ make: e.target.value || null, model: null })}>
            <option value="">All makes</option>
            {makes.map((m) => <option key={m.id} value={m.slug}>{m.name}</option>)}
          </select>
          <select aria-label="Model" className={sel} value={f.get("model")} disabled={!make} onChange={(e) => f.set({ model: e.target.value || null })}>
            <option value="">All models</option>
            {models.map((m) => <option key={m.id} value={m.slug}>{m.name}</option>)}
          </select>
          <input aria-label="Variant" className={sel} placeholder="Variant (e.g. ZXI, SX)" defaultValue={f.get("variant")} onBlur={(e) => e.target.value !== f.get("variant") && f.set({ variant: e.target.value || null })} onKeyDown={(e) => e.key === "Enter" && f.set({ variant: (e.target as HTMLInputElement).value || null })} />
        </div>
      </Section>
      <Section title="Budget">
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="Minimum price" className={sel} value={f.get("priceMin")} onChange={(e) => f.set({ priceMin: e.target.value || null })}>
            <option value="">Min</option>
            {PRICES.map((p) => <option key={p} value={p}>{priceLabel(p)}</option>)}
          </select>
          <select aria-label="Maximum price" className={sel} value={f.get("priceMax")} onChange={(e) => f.set({ priceMax: e.target.value || null })}>
            <option value="">Max</option>
            {PRICES.map((p) => <option key={p} value={p}>{priceLabel(p)}</option>)}
          </select>
        </div>
      </Section>
      <Section title="Year">
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="From year" className={sel} value={f.get("yearMin")} onChange={(e) => f.set({ yearMin: e.target.value || null })}>
            <option value="">From</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select aria-label="To year" className={sel} value={f.get("yearMax")} onChange={(e) => f.set({ yearMax: e.target.value || null })}>
            <option value="">To</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </Section>
      <Section title="Kilometres">
        <select aria-label="Maximum kilometres" className={sel} value={f.get("kmMax")} onChange={(e) => f.set({ kmMax: e.target.value || null })}>
          <option value="">Any</option>
          {KMS.map((k) => <option key={k} value={k}>Under {k.toLocaleString("en-IN")} km</option>)}
        </select>
      </Section>
      <Section title="Fuel">
        <div className="flex flex-wrap gap-2">{FUELS.map((x) => <Chip key={x} on={f.getList("fuel").includes(x)} onClick={() => f.toggleList("fuel", x)}>{humanize(x)}</Chip>)}</div>
      </Section>
      <Section title="Transmission">
        <div className="flex flex-wrap gap-2">{TRANS.map((x) => <Chip key={x} on={f.getList("transmission").includes(x)} onClick={() => f.toggleList("transmission", x)}>{humanize(x)}</Chip>)}</div>
      </Section>
      <Section title="Body type">
        <div className="flex flex-wrap gap-2">{BODIES.map((x) => <Chip key={x} on={f.getList("body").includes(x)} onClick={() => f.toggleList("body", x)}>{humanize(x)}</Chip>)}</div>
      </Section>
      <Section title="Condition">
        <div className="flex flex-wrap gap-2">{CONDS.map((x) => <Chip key={x} on={f.getList("condition").includes(x)} onClick={() => f.toggleList("condition", x)}>{humanize(x)}</Chip>)}</div>
      </Section>
      <Section title="Location">
        <div className="space-y-2">
          <select aria-label="State" className={sel} value={state} onChange={(e) => f.set({ state: e.target.value || null, district: null })}>
            <option value="">All India</option>
            {states.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
          </select>
          <select aria-label="District" className={sel} value={f.get("district")} disabled={!state} onChange={(e) => f.set({ district: e.target.value || null })}>
            <option value="">All districts</option>
            {districts.map((d) => <option key={d.id} value={d.slug}>{d.name}</option>)}
          </select>
        </div>
      </Section>
    </div>
  );
}

export function FilterPanel({ makes, states }: { makes: Opt[]; states: Opt[] }) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-white px-4 shadow-[var(--shadow-card)]">
        <Panel makes={makes} states={states} />
      </div>
    </aside>
  );
}

export function MobileFilters({ makes, states, total }: { makes: Opt[]; states: Opt[]; total: number }) {
  const [open, setOpen] = useState(false);
  const f = useFilters();
  const count = useMemo(() => [...f.sp.keys()].filter((k) => !["sort", "page", "q"].includes(k)).length, [f.sp]);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="lg:hidden">
        <SlidersHorizontal className="h-4 w-4" /> Filters{count ? ` (${count})` : ""}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Filters" footer={<Button block onClick={() => setOpen(false)}>Show {total.toLocaleString("en-IN")} cars</Button>}>
        <Panel makes={makes} states={states} />
      </Modal>
    </>
  );
}

export function SortSelect() {
  const f = useFilters();
  return (
    <select aria-label="Sort by" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[14px] font-semibold text-ink-900" value={f.get("sort") || "newest"} onChange={(e) => f.set({ sort: e.target.value === "newest" ? null : e.target.value })}>
      <option value="newest">Newest</option>
      <option value="price_asc">Price: low to high</option>
      <option value="price_desc">Price: high to low</option>
      <option value="km_asc">Lowest KM</option>
      <option value="ending_soon">Ending soon</option>
      <option value="most_bids">Most bids</option>
      <option value="popular">Popular</option>
    </select>
  );
}

export function ActiveFilters({ labels }: { labels: { key: string; label: string; value?: string }[] }) {
  const f = useFilters();
  if (!labels.length) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {labels.map((l) => (
        <button key={l.key + (l.value ?? "")} onClick={() => (l.value ? f.toggleList(l.key, l.value) : f.set({ [l.key]: null }))} className="inline-flex items-center gap-1 rounded-full bg-ink-900 px-3 py-1 text-[12.5px] font-semibold text-white">
          {l.label} <X className="h-3.5 w-3.5" />
        </button>
      ))}
      <button onClick={() => f.set(Object.fromEntries([...f.sp.keys()].filter((k) => k !== "sort").map((k) => [k, null])))} className="text-[12.5px] font-semibold text-slate-500 underline hover:text-ink-900">
        Clear all
      </button>
    </div>
  );
}

export function SearchInput() {
  const f = useFilters();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q") as string;
        f.set({ q: q.trim() || null });
      }}
      className="relative flex-1"
      role="search"
    >
      <input name="q" defaultValue={f.get("q")} placeholder="Search make, model, variant or city — e.g. “Creta diesel Kochi”" className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-3 pr-24 text-[15px] focus:border-ink-900 focus:outline-none focus:ring-2 focus:ring-ink-900/10" />
      <button className="absolute right-1 top-1 h-9 rounded-md bg-ink-900 px-4 text-sm font-semibold text-white">Search</button>
    </form>
  );
}
