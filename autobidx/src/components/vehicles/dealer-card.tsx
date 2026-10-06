import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import { VerificationBadge } from "../ui/badge";
import { formatNumber } from "@/lib/format";

export function DealerCard({ d }: { d: { slug: string; name: string; ratingAvg: number; ratingCount: number; soldCount: number; createdAt: Date; district: { name: string }; state: { name: string }; _count?: { vehicles: number } } }) {
  const initials = d.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <Link href={`/dealer/${d.slug}`} className="group flex flex-col rounded-[var(--radius-card)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-900 font-display text-lg font-bold text-white">{initials}</div>
        <div className="min-w-0">
          <h3 className="truncate font-sans text-[15px] font-bold text-ink-900 group-hover:text-ignite-600">{d.name}</h3>
          <div className="flex items-center gap-1 text-[12.5px] text-slate-500"><MapPin className="h-3.5 w-3.5" />{d.district.name}, {d.state.name}</div>
        </div>
      </div>
      <VerificationBadge className="mt-3" />
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
        <div>
          <div className="num flex items-center justify-center gap-1 text-[15px] font-bold text-ink-900">{d.ratingCount ? d.ratingAvg.toFixed(1) : "—"}<Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /></div>
          <div className="text-[11px] text-slate-500">{d.ratingCount} reviews</div>
        </div>
        <div>
          <div className="num text-[15px] font-bold text-ink-900">{formatNumber(d.soldCount)}</div>
          <div className="text-[11px] text-slate-500">sold</div>
        </div>
        <div>
          <div className="num text-[15px] font-bold text-ink-900">{d._count?.vehicles ?? "—"}</div>
          <div className="text-[11px] text-slate-500">live now</div>
        </div>
      </div>
    </Link>
  );
}
