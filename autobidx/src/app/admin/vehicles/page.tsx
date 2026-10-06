import Link from "next/link";
import type { Prisma, VehicleStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDate, formatINR, formatNumber } from "@/lib/format";
import { requirePermission } from "@/server/auth/rbac";
import { getCurrentActor } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { ActionButton } from "@/components/ui/action-button";
import { Pills, SearchBox } from "../_filters";

export const metadata = { title: "Vehicles" };

export default async function AdminVehicles({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string; dealer?: string }> }) {
  requirePermission(await getCurrentActor(), "vehicles.manage");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.VehicleWhereInput = {
    ...(sp.status ? { status: sp.status as VehicleStatus } : {}),
    ...(sp.dealer ? { dealerId: sp.dealer } : {}),
    ...(sp.q ? { OR: [{ searchText: { contains: sp.q.toLowerCase() } }, { code: sp.q.toLowerCase() }, { registrationNumber: { contains: sp.q.toUpperCase().replace(/\s/g, "") } }, { dealer: { name: { contains: sp.q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total, counts] = await Promise.all([
    prisma.vehicle.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * 25, take: 25, include: { dealer: { select: { name: true, id: true } }, images: { take: 1, orderBy: { sortOrder: "asc" } } } }),
    prisma.vehicle.count({ where }),
    prisma.vehicle.groupBy({ by: ["status"], _count: true }),
  ]);
  const c = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
  return (
    <div>
      <PageHeader title="Vehicles" subtitle={`${formatNumber(total)} listings`} />
      <Pills base="/admin/vehicles" current={sp.status} extra={{ q: sp.q, dealer: sp.dealer }} options={[["", "All"], ["PENDING_APPROVAL", `Pending approval (${c("PENDING_APPROVAL")})`], ["PUBLISHED", "Published"], ["AUCTION_LIVE", `Auction live (${c("AUCTION_LIVE")})`], ["AUCTION_ENDED", "Auction ended"], ["RESERVED", "Sale pending"], ["SOLD", "Sold"], ["DRAFT", "Draft"], ["SUSPENDED", "Suspended"], ["REJECTED", "Rejected"], ["CANCELLED", "Cancelled"]]} />
      <SearchBox placeholder="Make/model, listing code, registration no. or dealer" q={sp.q} hidden={{ status: sp.status, dealer: sp.dealer }} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        mobileTitle={(r) => <Link href={`/admin/vehicles/${r.id}`}>{r.title}</Link>}
        empty={<EmptyState title="No vehicles match" />}
        columns={[
          {
            key: "v",
            header: "Vehicle",
            hideOnMobile: true,
            cell: (r) => (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.images[0] ? <img src={r.images[0].thumbUrl ?? r.images[0].url} alt="" className="h-10 w-14 rounded object-cover" /> : <div className="h-10 w-14 rounded bg-slate-100" />}
                <div className="min-w-0"><Link href={`/admin/vehicles/${r.id}`} className="block max-w-[240px] truncate font-semibold text-ink-900 hover:text-ignite-600">{r.title}</Link><div className="text-[12px] text-slate-400">#{r.code} · {r.registrationNumber ?? "—"}</div></div>
              </div>
            ),
          },
          { key: "d", header: "Dealer", cell: (r) => <Link href={`/admin/dealers/${r.dealer.id}`} className="hover:text-ignite-600">{r.dealer.name}</Link> },
          { key: "p", header: "Price", align: "right", cell: (r) => formatINR(r.currentBid ?? r.expectedPrice) },
          { key: "u", header: "Updated", cell: (r) => formatDate(r.updatedAt) },
          { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          { key: "a", header: "", align: "right", cell: (r) => (r.status === "PENDING_APPROVAL" ? <div className="flex justify-end gap-1.5"><ActionButton url={`/api/admin/vehicles/${r.id}`} body={{ action: "approve" }} label="Approve" variant="success" success="Listing approved" /><ActionButton url={`/api/admin/vehicles/${r.id}`} body={{ action: "reject" }} label="Reject" danger reason={{ label: "What should the dealer fix?", required: true }} success="Listing rejected" /></div> : <Link href={`/admin/vehicles/${r.id}`} className="text-[13px] font-semibold text-ignite-600">Manage</Link>) },
        ]}
      />
      <Pagination page={page} pages={Math.ceil(total / 25)} basePath="/admin/vehicles" params={sp} />
    </div>
  );
}
