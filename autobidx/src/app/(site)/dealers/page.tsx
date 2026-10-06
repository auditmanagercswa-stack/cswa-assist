import type { Metadata } from "next";
import { Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { getStates } from "@/server/services/catalog";
import { DealerCard } from "@/components/vehicles/dealer-card";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";

export const metadata: Metadata = { title: "Verified used-car dealers", description: "KYC-verified used-car dealerships on Alpha Cars across Kerala and India.", alternates: { canonical: "/dealers" } };

export default async function DealersPage({ searchParams }: { searchParams: Promise<{ q?: string; state?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.slice(0, 60);
  const where = { status: "VERIFIED" as const, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}), ...(sp.state ? { state: { slug: sp.state } } : {}) };
  const [items, total, states] = await Promise.all([
    prisma.dealer.findMany({
      where,
      orderBy: [{ soldCount: "desc" }, { name: "asc" }],
      skip: (page - 1) * 24,
      take: 24,
      select: { slug: true, name: true, ratingAvg: true, ratingCount: true, soldCount: true, createdAt: true, district: { select: { name: true } }, state: { select: { name: true } }, _count: { select: { vehicles: { where: { status: { in: ["PUBLISHED", "AUCTION_LIVE"] } } } } } },
    }),
    prisma.dealer.count({ where }),
    getStates(),
  ]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-[28px] font-bold text-ink-900 sm:text-[34px]">Verified dealers</h1>
      <p className="mt-1 text-sm text-slate-500">Every dealership is KYC-verified — PAN, GST, business registration and bank account.</p>
      <form className="mt-6 flex flex-col gap-2 sm:flex-row" role="search">
        <input name="q" defaultValue={q} placeholder="Search dealership name" className="h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 focus:border-ink-900 focus:outline-none" />
        <select name="state" defaultValue={sp.state ?? ""} className="h-11 rounded-lg border border-slate-300 bg-white px-3">
          <option value="">All states</option>
          {states.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
        </select>
        <button className="h-11 rounded-lg bg-ink-900 px-5 font-semibold text-white">Search</button>
      </form>
      <div className="mt-6">
        {items.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{items.map((d) => <DealerCard key={d.slug} d={d} />)}</div> : <EmptyState icon={<Users className="h-7 w-7" />} title="No dealers found" description="Try a different name or state." />}
        <Pagination page={page} pages={Math.ceil(total / 24)} basePath="/dealers" params={sp} />
      </div>
    </div>
  );
}
