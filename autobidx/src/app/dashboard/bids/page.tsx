import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import { formatDateTime, formatINR } from "@/lib/format";
import { getCurrentActor } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty";
import { ButtonLink } from "@/components/ui/button";
import { AuctionTimer } from "@/components/auction/auction-timer";

export const metadata = { title: "My Bids" };

export default async function MyBids({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "active" } = await searchParams;
  const actor = (await getCurrentActor())!;
  const now = new Date();
  const auctionIds = (await prisma.bid.findMany({ where: { bidderId: actor.userId }, distinct: ["auctionId"], select: { auctionId: true }, take: 500 })).map((b) => b.auctionId);
  const statusFilter = tab === "won" ? { winnerId: actor.userId } : tab === "lost" ? { status: { in: ["ENDED" as const, "CANCELLED" as const] }, NOT: { winnerId: actor.userId } } : { status: "LIVE" as const };
  const auctions = await prisma.auction.findMany({
    where: { id: { in: auctionIds }, ...statusFilter },
    include: { vehicle: { select: { title: true, code: true, images: { take: 1, orderBy: { sortOrder: "asc" } } } }, orders: { where: { buyerId: actor.userId }, select: { id: true, status: true } } },
    orderBy: tab === "active" ? { endAt: "asc" } : { closedAt: "desc" },
    take: 100,
  });
  const myMax = await prisma.bid.groupBy({ by: ["auctionId"], where: { bidderId: actor.userId, auctionId: { in: auctions.map((a) => a.id) }, status: "VALID" }, _max: { amount: true } });
  const maxBy = new Map(myMax.map((m) => [m.auctionId, m._max.amount]));
  const autos = await prisma.autoBid.findMany({ where: { userId: actor.userId, active: true, auctionId: { in: auctions.map((a) => a.id) } } });
  const autoBy = new Map(autos.map((a) => [a.auctionId, a.maxAmount]));
  const wonCount = await prisma.auction.count({ where: { winnerId: actor.userId } });
  return (
    <div>
      <PageHeader title="My Bids & Won Vehicles" subtitle="Track every auction you're in" actions={<ButtonLink href="/auctions" variant="outline">Find auctions</ButtonLink>} />
      <div className="mb-4 flex gap-1.5">
        {[["active", "Active bids"], ["won", `Won (${wonCount})`], ["lost", "Ended / lost"]].map(([k, l]) => (
          <Link key={k} href={`/dashboard/bids?tab=${k}`} className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-semibold", tab === k ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{l}</Link>
        ))}
      </div>
      <DataTable
        rows={auctions}
        rowKey={(r) => r.id}
        mobileTitle={(r) => r.vehicle.title}
        empty={<EmptyState icon={<ShoppingBag className="h-7 w-7" />} title={tab === "active" ? "No active bids" : tab === "won" ? "No won vehicles yet" : "Nothing here yet"} description="Browse live auctions and place your first bid." action={<ButtonLink href="/auctions">Browse auctions</ButtonLink>} />}
        columns={[
          { key: "v", header: "Vehicle", hideOnMobile: true, cell: (r) => <Link href={`/auctions/${r.id}`} className="font-semibold text-ink-900 hover:text-ignite-600">{r.vehicle.title}</Link> },
          { key: "c", header: tab === "active" ? "Current bid" : "Final bid", align: "right", cell: (r) => <span className="font-bold text-ink-900">{formatINR(r.currentBid)}</span> },
          { key: "m", header: "Your highest", align: "right", cell: (r) => <div>{formatINR(maxBy.get(r.id))}{autoBy.get(r.id) ? <div className="text-[11.5px] text-slate-400">auto max {formatINR(autoBy.get(r.id))}</div> : null}</div> },
          {
            key: "s",
            header: "Status",
            cell: (r) =>
              r.status === "LIVE" ? (r.currentBidderId === actor.userId ? <Badge tone="green">Winning</Badge> : <Badge tone="red">Outbid</Badge>) : r.winnerId === actor.userId ? <Badge tone="green">Won</Badge> : <StatusBadge status={r.result ?? r.status} />,
          },
          { key: "t", header: tab === "active" ? "Ends in" : "Ended", cell: (r) => (r.status === "LIVE" ? <AuctionTimer endAt={r.endAt.toISOString()} serverTime={now.toISOString()} /> : formatDateTime(r.closedAt ?? r.endAt)) },
          {
            key: "a",
            header: "",
            align: "right",
            cell: (r) => {
              const o = r.orders[0];
              if (o?.status === "PAYMENT_PENDING") return <ButtonLink href={`/checkout/${o.id}`} size="sm">Pay now</ButtonLink>;
              if (o) return <Link href={`/dashboard/orders/${o.id}`} className="text-[13px] font-semibold text-ignite-600">Track order</Link>;
              return r.status === "LIVE" ? <ButtonLink href={`/auctions/${r.id}`} size="sm" variant={r.currentBidderId === actor.userId ? "outline" : "primary"}>{r.currentBidderId === actor.userId ? "View" : "Bid again"}</ButtonLink> : null;
            },
          },
        ]}
      />
    </div>
  );
}
