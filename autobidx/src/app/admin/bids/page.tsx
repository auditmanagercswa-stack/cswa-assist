import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDateTime, formatINR } from "@/lib/format";
import { can, requirePermission } from "@/server/auth/rbac";
import { getCurrentActor } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { ActionButton } from "@/components/ui/action-button";
import { SearchBox } from "../_filters";

export const metadata = { title: "Bids" };

export default async function AdminBids({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; auction?: string }> }) {
  const actor = requirePermission(await getCurrentActor(), "bids.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.BidWhereInput = {
    ...(sp.auction ? { auctionId: sp.auction } : {}),
    ...(sp.q ? { OR: [{ bidder: { email: { contains: sp.q.toLowerCase() } } }, { dealer: { name: { contains: sp.q, mode: "insensitive" } } }, { auction: { vehicle: { searchText: { contains: sp.q.toLowerCase() } } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.bid.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 40, take: 40, include: { bidder: { select: { name: true, email: true } }, dealer: { select: { id: true, name: true } }, auction: { select: { id: true, status: true, vehicle: { select: { title: true } } } } } }),
    prisma.bid.count({ where }),
  ]);
  return (
    <div>
      <PageHeader title="Bids" subtitle="Full bid ledger with bidder identities (admin only)" />
      <SearchBox placeholder="Bidder email, dealer or vehicle" q={sp.q} hidden={{ auction: sp.auction }} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        mobileTitle={(r) => r.auction.vehicle.title}
        empty={<EmptyState title="No bids found" />}
        columns={[
          { key: "t", header: "Time", cell: (r) => <span className="text-[12.5px]">{formatDateTime(r.createdAt)}</span> },
          { key: "v", header: "Auction", hideOnMobile: true, cell: (r) => <Link href={`/auctions/${r.auction.id}`} className="font-semibold text-ink-900 hover:text-ignite-600">{r.auction.vehicle.title}</Link> },
          { key: "b", header: "Bidder", cell: (r) => <div>{r.dealer ? <Link href={`/admin/dealers/${r.dealer.id}`} className="font-semibold hover:text-ignite-600">{r.dealer.name}</Link> : r.bidder.name}<div className="text-[11.5px] text-slate-400">{r.bidder.email}{r.ip ? ` · ${r.ip}` : ""}</div></div> },
          { key: "a", header: "Amount", align: "right", cell: (r) => <span className="font-bold">{formatINR(r.amount)}</span> },
          { key: "k", header: "Type", cell: (r) => (r.isAuto ? <Badge tone="violet">auto</Badge> : <Badge>manual</Badge>) },
          { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status === "VALID" ? "ACTIVE" : r.status} /> },
          { key: "x", header: "", align: "right", cell: (r) => (r.status === "VALID" && r.auction.status === "LIVE" && can(actor, "bids.manage") ? <ActionButton url={`/api/admin/bids/${r.id}`} label="Cancel bid" danger reason={{ label: "Reason (sent to the bidder)", required: true }} success="Bid cancelled" /> : null) },
        ]}
      />
      <Pagination page={page} pages={Math.ceil(total / 40)} basePath="/admin/bids" params={sp} />
    </div>
  );
}
