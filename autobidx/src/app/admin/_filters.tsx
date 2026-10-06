import Link from "next/link";
import { cn } from "@/lib/cn";

/** Server-rendered pill filters + search box for admin lists (pure links/forms — no JS needed). */
export function Pills({ base, current, param = "status", options, extra = {} }: { base: string; current?: string; param?: string; options: [string, string][]; extra?: Record<string, string | undefined> }) {
  const href = (v: string) => {
    const sp = new URLSearchParams(Object.entries(extra).filter(([, x]) => x) as [string, string][]);
    if (v) sp.set(param, v);
    const q = sp.toString();
    return q ? `${base}?${q}` : base;
  };
  return (
    <div className="scroll-rail mb-3 flex gap-1.5 overflow-x-auto">
      {options.map(([v, l]) => (
        <Link key={v || "all"} href={href(v)} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold", (current ?? "") === v ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-400")}>{l}</Link>
      ))}
    </div>
  );
}

export function SearchBox({ placeholder, q, hidden = {} }: { placeholder: string; q?: string; hidden?: Record<string, string | undefined> }) {
  return (
    <form className="mb-4 flex gap-2" role="search">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input name="q" defaultValue={q} placeholder={placeholder} className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-[14px] focus:border-ink-900 focus:outline-none" />
      <button className="h-10 rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white">Search</button>
    </form>
  );
}
