import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarDays, MapPin, Star } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";
import { getCurrentActor } from "@/server/auth/session";
import { getDealerPublic } from "@/server/services/dealers";
import { cardSelect } from "@/server/services/vehicles";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { EmptyState } from "@/components/ui/empty";
import { Card } from "@/components/ui/card";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const d = await getDealerPublic((await params).id);
  if (!d) return { title: "Dealer not found" };
  return { title: `${d.name} — verified used-car dealer in ${d.district.name}`, description: d.description ?? undefined, alternates: { canonical: `/dealer/${d.slug}` } };
}

export default async function DealerPage({ params }: { params: Promise<{ id: string }> }) {
  const d = await getDealerPublic((await params).id);
  if (!d) notFound();
  const actor = await getCurrentActor();
  const vehicles = await prisma.vehicle.findMany({ where: { dealerId: d.id, status: { in: ["PUBLISHED", "AUCTION_LIVE"] } }, orderBy: { publishedAt: "desc" }, take: 24, select: cardSelect });
  const initials = d.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <div>
      <div className="bg-ink-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white font-display text-3xl font-bold text-ink-900">{initials}</div>
          <div className="flex-1">
            <h1 className="text-[28px] font-bold sm:text-[34px]">{d.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px] text-white/70">
              {d.status === "VERIFIED" && <span className="flex items-center gap-1 font-semibold text-emerald-300"><BadgeCheck className="h-4 w-4" />Verified dealer{d.gstRegistered ? " · GST registered" : ""}</span>}
              <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{[d.city?.name, d.district.name, d.state.name].filter(Boolean).join(", ")}</span>
              <span className="flex items-center gap-1"><CalendarDays className="h-4 w-4" />Member since {formatDate(d.createdAt, { month: "long", year: "numeric" })}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div><div className="num flex items-center justify-center gap-1 text-2xl font-bold">{d.ratingCount ? d.ratingAvg.toFixed(1) : "—"}<Star className="h-5 w-5 fill-amber-400 text-amber-400" /></div><div className="text-[12px] text-white/60">{d.ratingCount} reviews</div></div>
            <div><div className="num text-2xl font-bold">{formatNumber(d.soldCount)}</div><div className="text-[12px] text-white/60">vehicles sold</div></div>
            <div><div className="num text-2xl font-bold">{vehicles.length}</div><div className="text-[12px] text-white/60">live listings</div></div>
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-4 text-xl font-bold text-ink-900">Vehicles from {d.name}</h2>
          {vehicles.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{vehicles.map((v) => <VehicleCard key={v.id} v={v} signedIn={!!actor} serverTime={new Date().toISOString()} />)}</div> : <EmptyState title="No live listings right now" description="Check back soon — this dealer lists new stock regularly." />}
        </div>
        <aside className="space-y-4">
          {d.description && <Card><h3 className="mb-2 font-sans text-[15px] font-bold">About</h3><p className="text-[14px] leading-relaxed text-slate-600">{d.description}</p></Card>}
          <Card>
            <h3 className="mb-3 font-sans text-[15px] font-bold">Buyer reviews</h3>
            {d.reviewsReceived.length === 0 ? <p className="text-sm text-slate-500">No reviews yet.</p> : (
              <ul className="space-y-4">
                {d.reviewsReceived.map((r) => (
                  <li key={r.id} className="border-b border-slate-100 pb-3 last:border-0">
                    <div className="flex items-center gap-0.5">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={i < r.rating ? "h-3.5 w-3.5 fill-amber-400 text-amber-400" : "h-3.5 w-3.5 text-slate-200"} />)}</div>
                    {r.comment && <p className="mt-1 text-[13.5px] text-slate-700">{r.comment}</p>}
                    <div className="mt-1 text-[12px] text-slate-400">{r.author.name} · {formatDate(r.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
