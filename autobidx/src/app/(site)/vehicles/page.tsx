import type { Metadata } from "next";
import { Suspense } from "react";
import { CarFront } from "lucide-react";
import { prisma } from "@/lib/db";
import { vehicleSearchSchema } from "@/lib/validation";
import { humanize } from "@/lib/format";
import { getCurrentActor } from "@/server/auth/session";
import { getMakes, getStates } from "@/server/services/catalog";
import { searchVehicles } from "@/server/services/vehicles";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { ActiveFilters, FilterPanel, MobileFilters, SearchInput, SortSelect } from "@/components/vehicles/filter-panel";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty";
import { ButtonLink } from "@/components/ui/button";

type SP = Record<string, string | string[] | undefined>;

function normalise(sp: SP) {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v != null) flat[k] = Array.isArray(v) ? v.join(",") : v;
  return flat;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const p = vehicleSearchSchema.safeParse(normalise(await searchParams));
  const parts: string[] = [];
  if (p.success) {
    if (p.data.make) {
      const make = await prisma.make.findUnique({ where: { slug: p.data.make }, select: { name: true } });
      if (make) parts.push(make.name);
    }
    if (p.data.body?.length === 1) parts.push(humanize(p.data.body[0]) + "s");
    if (p.data.fuel?.length === 1) parts.push(humanize(p.data.fuel[0]));
  }
  const title = parts.length ? `Used ${parts.join(" ")} cars for sale` : "Used cars for sale from verified dealers";
  return { title, description: `${title} — bid in live auctions or buy now on AutoBidX.`, alternates: { canonical: "/vehicles" } };
}

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const raw = normalise(await searchParams);
  const parsed = vehicleSearchSchema.safeParse(raw);
  const params = parsed.success ? parsed.data : vehicleSearchSchema.parse({});
  const actor = await getCurrentActor();
  const [result, makes, states, watch] = await Promise.all([
    searchVehicles(params),
    getMakes(),
    getStates(),
    actor ? prisma.watchlist.findMany({ where: { userId: actor.userId }, select: { vehicleId: true } }) : [],
  ]);
  const watching = new Set(watch.map((w) => w.vehicleId));
  const serverTime = new Date().toISOString();
  const makeOpts = makes.map((m) => ({ id: m.id, name: m.name, slug: m.slug }));

  const chips: { key: string; label: string; value?: string }[] = [];
  if (params.q) chips.push({ key: "q", label: `“${params.q}”` });
  if (params.make) chips.push({ key: "make", label: makes.find((m) => m.slug === params.make)?.name ?? params.make });
  if (params.model) chips.push({ key: "model", label: params.model.replace(/-/g, " ") });
  if (params.priceMin) chips.push({ key: "priceMin", label: `≥ ₹${(params.priceMin / 1e5).toFixed(1)}L` });
  if (params.priceMax) chips.push({ key: "priceMax", label: `≤ ₹${(params.priceMax / 1e5).toFixed(1)}L` });
  if (params.yearMin) chips.push({ key: "yearMin", label: `${params.yearMin}+` });
  if (params.yearMax) chips.push({ key: "yearMax", label: `≤ ${params.yearMax}` });
  if (params.kmMax) chips.push({ key: "kmMax", label: `< ${params.kmMax.toLocaleString("en-IN")} km` });
  for (const k of ["fuel", "transmission", "body", "condition"] as const) for (const v of params[k] ?? []) chips.push({ key: k, label: humanize(v), value: v });
  if (params.state) chips.push({ key: "state", label: states.find((s) => s.slug === params.state)?.name ?? params.state });
  if (params.district) chips.push({ key: "district", label: params.district.replace(/-/g, " ") });
  if (params.auction) chips.push({ key: "auction", label: params.auction === "live" ? "Live auction" : params.auction === "upcoming" ? "Upcoming auction" : "No auction" });
  if (params.buyNow) chips.push({ key: "buyNow", label: "Buy Now" });
  if (params.inspected) chips.push({ key: "inspected", label: "Inspected" });
  if (params.luxury) chips.push({ key: "luxury", label: "Luxury" });
  if (params.dealer) chips.push({ key: "dealer", label: params.dealer.replace(/-/g, " ") });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <h1 className="text-[26px] font-bold text-ink-900 sm:text-[32px]">Used cars from verified dealers</h1>
        <p className="mt-1 text-sm text-slate-500">{result.total.toLocaleString("en-IN")} vehicles · live auctions, Buy Now and offers</p>
      </div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <Suspense>
          <SearchInput />
        </Suspense>
        <div className="flex gap-2">
          <Suspense>
            <MobileFilters makes={makeOpts} states={states} total={result.total} />
            <SortSelect />
          </Suspense>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Suspense>
          <FilterPanel makes={makeOpts} states={states} />
        </Suspense>
        <div>
          <Suspense>
            <ActiveFilters labels={chips} />
          </Suspense>
          {result.items.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {result.items.map((v, i) => (
                <VehicleCard key={v.id} v={v} watching={watching.has(v.id)} signedIn={!!actor} serverTime={serverTime} priority={i < 3} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<CarFront className="h-7 w-7" />} title="No vehicles found" description="Try removing a filter or widening your budget. New cars are listed every day." action={<ButtonLink href="/vehicles" variant="dark">Clear filters</ButtonLink>} />
          )}
          <Pagination page={result.page} pages={result.pages} basePath="/vehicles" params={raw} />
        </div>
      </div>
    </div>
  );
}
