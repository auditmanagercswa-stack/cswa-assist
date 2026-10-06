"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

type Opt = { id: string; name: string; slug: string };

const PRICE = [
  ["", "Any budget"],
  ["300000", "Under ₹3 Lakh"],
  ["500000", "Under ₹5 Lakh"],
  ["800000", "Under ₹8 Lakh"],
  ["1200000", "Under ₹12 Lakh"],
  ["2000000", "Under ₹20 Lakh"],
  ["5000000", "Under ₹50 Lakh"],
];

/** Hero search: make → model, location, registration year, budget. */
export function SearchBar({ makes, states, className }: { makes: Opt[]; states: Opt[]; className?: string }) {
  const router = useRouter();
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<Opt[]>([]);
  const [state, setState] = useState("kerala");
  const [year, setYear] = useState("");
  const [price, setPrice] = useState("");
  useEffect(() => {
    setModel("");
    if (!make) return setModels([]);
    api<{ items: Opt[] }>(`/api/catalog/models?make=${make}`).then(({ data }) => setModels(data?.items ?? []));
  }, [make]);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (make) sp.set("make", make);
    if (model) sp.set("model", model);
    if (state) sp.set("state", state);
    if (year) sp.set("yearMin", year);
    if (price) sp.set("priceMax", price);
    router.push(`/vehicles?${sp.toString()}`);
  }
  const sel = "h-12 w-full min-w-0 appearance-none rounded-lg border-0 bg-slate-50 px-3 text-[14px] font-medium text-ink-900 ring-1 ring-inset ring-slate-200 focus:bg-white focus:ring-2 focus:ring-ink-900";
  const years = Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - i * 1);
  return (
    <form onSubmit={submit} className={cn("rounded-2xl bg-white p-3 shadow-[var(--shadow-lift)] sm:p-4", className)} role="search" aria-label="Search used cars">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr_auto]">
        <select aria-label="Make" className={sel} value={make} onChange={(e) => setMake(e.target.value)}>
          <option value="">All makes</option>
          {makes.map((m) => <option key={m.id} value={m.slug}>{m.name}</option>)}
        </select>
        <select aria-label="Model" className={sel} value={model} onChange={(e) => setModel(e.target.value)} disabled={!make}>
          <option value="">{make ? "All models" : "Select make first"}</option>
          {models.map((m) => <option key={m.id} value={m.slug}>{m.name}</option>)}
        </select>
        <select aria-label="Location" className={sel} value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All India</option>
          {states.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
        </select>
        <select aria-label="Registration year from" className={sel} value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">Any year</option>
          {years.map((y) => <option key={y} value={y}>{y} or newer</option>)}
        </select>
        <select aria-label="Budget" className={cn(sel, "col-span-2 md:col-span-1")} value={price} onChange={(e) => setPrice(e.target.value)}>
          {PRICE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="submit" className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-lg bg-ignite-500 px-6 text-[15px] font-bold text-white hover:bg-ignite-600 md:col-span-1">
          <Search className="h-5 w-5" /> Search
        </button>
      </div>
    </form>
  );
}
