import Link from "next/link";
import { Car, Plus } from "lucide-react";
import type { Prisma, VehicleStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import { formatINR, formatNumber, timeAgo } from "@/lib/format";
import { vehiclePath } from "@/lib/slug";
import { getCurrentActor } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { quoteServiceFee } from "@/server/services/fees";
import { PageHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { VehicleRowActions } from "@/components/dashboard/vehicle-actions";

export const metadata = { title: "My Vehicles" };

const TABS: [string, string, VehicleStatus[] | null][] = [
  ["all", "All", null],
  ["live", "Live", ["PUBLISHED", "AUCTION_LIVE"]],
  ["pending", "Pending approval", ["PENDING_APPROVAL"]],
  ["draft", "Drafts", ["DRAFT", "REJECTED"]],
  ["ended", "Auction ended", ["AUCTION_ENDED"]],
  ["sold", "Sold", ["SOLD", "RESERVED"]],
  ["inactive", "Inactive", ["SUSPENDED", "CANCELLED"]],
];

export default async function MyVehicles({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string; q?: string }> }) {
  const sp = await searchParams;
  const actor = (await getCurrentActor())!;
  const dealerId = actor.dealer?.id ?? "none";
  const tab = TABS.find((t) => t[0] === sp.tab) ?? TABS[0];
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.VehicleWhereInput = { dealerId, ...(tab[2] ? { status: { in: tab[2] } } : {}), ...(sp.q ? { searchText: { contains: sp.q.toLowerCase() } } : {}) };
  const [rows, total, counts, methods, featured] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * 20,
      take: 20,
      include: { make: true, model: true, images: { take: 1, orderBy: { sortOrder: "asc" } }, inspections: { where: { status: { in: ["REQUESTED", "SCHEDULED"] } }, select: { id: true } } },
    }),
    prisma.vehicle.count({ where }),
    prisma.vehicle.groupBy({ by: ["status"], where: { dealerId }, _count: true }),
    getSetting("payments.enabledMethods"),
    actor.dealer ? quoteServiceFee("FEATURED", actor.dealer.id, 0) : { total: 0 },
  ]);
  const countFor = (st: VehicleStatus[] | null) => counts.filter((c) => !st || st.includes(c.status)).reduce((s, c) => s + c._count, 0);
  return (
    <div>
      <PageHeader title="My Vehicles" subtitle={`${countFor(null)} listings`} actions={<ButtonLink href="/dashboard/vehicles/new"><Plus className="h-4 w-4" />List a vehicle</ButtonLink>} />
      <div className="scroll-rail mb-4 flex gap-1.5 overflow-x-auto">
        {TABS.map(([k, l, st]) => (
          <Link key={k} href={k === "all" ? "/dashboard/vehicles" : `/dashboard/vehicles?tab=${k}`} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold", tab[0] === k ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-400")}>
            {l} <span className="num opacity-60">{countFor(st)}</span>
          </Link>
        ))}
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        mobileTitle={(r) => r.title}
        empty={<EmptyState icon={<Car className="h-7 w-7" />} title={tab[0] === "all" ? "No vehicles yet" : "Nothing here"} description="Start by listing your first vehicle." action={<ButtonLink href="/dashboard/vehicles/new">List Vehicle</ButtonLink>} />}
        columns={[
          {
            key: "v",
            header: "Vehicle",
            hideOnMobile: true,
            cell: (r) => (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.images[0] ? <img src={r.images[0].thumbUrl ?? r.images[0].url} alt="" className="h-12 w-16 rounded-md object-cover" /> : <div className="h-12 w-16 rounded-md bg-slate-100" />}
                <div className="min-w-0">
                  <Link href={`/dashboard/vehicles/${r.id}`} className="block max-w-[260px] truncate font-semibold text-ink-900 hover:text-ignite-600">{r.title}</Link>
                  <div className="text-[12px] text-slate-400">#{r.code} · updated {timeAgo(r.updatedAt)}</div>
                </div>
              </div>
            ),
          },
          { key: "s", header: "Status", cell: (r) => <div className="flex flex-col items-start gap-1"><StatusBadge status={r.status} />{r.statusReason && r.status === "REJECTED" && <span className="max-w-[180px] truncate text-[11.5px] text-red-600" title={r.statusReason}>{r.statusReason}</span>}</div> },
          { key: "p", header: "Price / bid", align: "right", cell: (r) => <div><div className="font-semibold text-ink-900">{formatINR(r.currentBid ?? r.expectedPrice)}</div>{r.currentBid ? <div className="text-[11.5px] text-slate-400">{r.bidCount} bids</div> : null}</div> },
          { key: "e", header: "Views · Watch", align: "right", cell: (r) => `${formatNumber(r.viewCount)} · ${formatNumber(r.watchCount)}` },
          { key: "a", header: "", align: "right", cell: (r) => <VehicleRowActions v={{ id: r.id, status: r.status, href: vehiclePath(r), auctionEnabled: r.auctionEnabled, inspectionPending: r.inspections.length > 0, featured: !!r.featuredUntil && r.featuredUntil > new Date() }} methods={methods} featuredFee={featured.total} /> },
        ]}
      />
      <Pagination page={page} pages={Math.ceil(total / 20)} basePath="/dashboard/vehicles" params={sp} />
    </div>
  );
}
