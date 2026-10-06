import Link from "next/link";
import type { AuctionStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDateTime, formatINR } from "@/lib/format";
import { requirePermission } from "@/server/auth/rbac";
import { getCurrentActor } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { ActionButton } from "@/components/ui/action-button";
import { AuctionTimer } from "@/components/auction/auction-timer";
import { Pills } from "../_filters";

export const metadata = { title: "Auctions" };

export default async function AdminAuctions({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  requirePermission(await getCurrentActor(), "auctions.manage");
  const sp = await searchParams;
  const status = (sp.status ?? "LIVE") as AuctionStatus;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.AuctionWhereInput = { status };
  const [rows, total] = await Promise.all([
    prisma.auction.findMany({ where, orderBy: status === "LIVE" ? { endAt: "asc" } : status === "SCHEDULED" ? { startAt: "asc" } : { closedAt: "desc" }, skip: (page - 1) * 25, take: 25, include: { vehicle: { select: { id: true, title: true, dealer: { select: { name: true } } } } } }),
    prisma.auction.count({ where }),
  ]);
  const now = new Date().toISOString();
  return (
    <div>
      <PageHeader title="Auctions" subtitle="Monitor, start, stop and settle auctions" />
      <Pills base="/admin/auctions" current={status} options={[["LIVE", "Live"], ["SCHEDULED", "Scheduled"], ["ENDED", "Ended"], ["CANCELLED", "Cancelled"]]} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        mobileTitle={(r) => r.vehicle.title}
        empty={<EmptyState title={`No ${status.toLowerCase()} auctions`} />}
        columns={[
          { key: "v", header: "Vehicle", hideOnMobile: true, cell: (r) => <div><Link href={`/admin/vehicles/${r.vehicle.id}`} className="font-semibold text-ink-900 hover:text-ignite-600">{r.vehicle.title}</Link><div className="text-[12px] text-slate-400">{r.vehicle.dealer.name}</div></div> },
          { key: "b", header: "Current / reserve", align: "right", cell: (r) => <div><div className="font-semibold">{formatINR(r.currentBid)}</div><div className="text-[11.5px] text-slate-400">reserve {formatINR(r.reservePrice)}</div></div> },
          { key: "n", header: "Bids", align: "right", cell: (r) => `${r.bidCount} (${r.bidderCount})` },
          { key: "t", header: status === "LIVE" ? "Ends in" : status === "SCHEDULED" ? "Starts" : "Closed", cell: (r) => (status === "LIVE" ? <AuctionTimer endAt={r.endAt.toISOString()} serverTime={now} /> : formatDateTime(status === "SCHEDULED" ? r.startAt : (r.closedAt ?? r.endAt))) },
          { key: "s", header: "Status", cell: (r) => <div className="flex flex-col items-start gap-0.5"><StatusBadge status={r.result ?? r.status} />{r.extensionCount > 0 && <span className="text-[11px] text-slate-400">extended ×{r.extensionCount}</span>}</div> },
          {
            key: "a",
            header: "",
            align: "right",
            cell: (r) => (
              <div className="flex justify-end gap-1.5">
                {r.status === "SCHEDULED" && <ActionButton url={`/api/admin/auctions/${r.id}`} body={{ action: "start" }} label="Start" variant="success" confirm={{ title: "Start now?" }} success="Started" />}
                {r.status === "LIVE" && <ActionButton url={`/api/admin/auctions/${r.id}`} body={{ action: "end" }} label="End" confirm={{ title: "End and settle now?" }} success="Closed" />}
                {(r.status === "LIVE" || r.status === "SCHEDULED") && <ActionButton url={`/api/admin/auctions/${r.id}`} body={{ action: "stop" }} label="Stop" danger reason={{ label: "Reason (sent to bidders)", required: true }} success="Cancelled" />}
                <Link href={`/auctions/${r.id}`} className="inline-flex h-8 items-center px-2 text-[13px] font-semibold text-ignite-600">Room</Link>
              </div>
            ),
          },
        ]}
      />
      <Pagination page={page} pages={Math.ceil(total / 25)} basePath="/admin/auctions" params={sp} />
    </div>
  );
}
