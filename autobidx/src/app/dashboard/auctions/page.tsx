import Link from "next/link";
import { Gavel } from "lucide-react";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import { formatDateTime, formatINR } from "@/lib/format";
import { getCurrentActor } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty";
import { ButtonLink } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
import { AuctionTimer } from "@/components/auction/auction-timer";

export const metadata = { title: "Active Auctions" };

export default async function SellerAuctions({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "live" } = await searchParams;
  const actor = (await getCurrentActor())!;
  const dealerId = actor.dealer?.id ?? "none";
  const status = tab === "scheduled" ? ["SCHEDULED" as const] : tab === "ended" ? ["ENDED" as const, "CANCELLED" as const] : ["LIVE" as const];
  const [rows, acceptHours] = await Promise.all([
    prisma.auction.findMany({ where: { vehicle: { dealerId }, status: { in: status } }, include: { vehicle: { select: { id: true, title: true, code: true, status: true } }, orders: { select: { id: true } } }, orderBy: tab === "ended" ? { closedAt: "desc" } : { endAt: "asc" }, take: 100 }),
    getSetting("auction.reserveNotMetAcceptHours"),
  ]);
  const now = new Date();
  return (
    <div>
      <PageHeader title="Auctions" subtitle="Your vehicles under the hammer" actions={<ButtonLink href="/dashboard/vehicles/new">List a vehicle</ButtonLink>} />
      <div className="mb-4 flex gap-1.5">
        {[["live", "Live"], ["scheduled", "Scheduled"], ["ended", "Ended"]].map(([k, l]) => (
          <Link key={k} href={`/dashboard/auctions?tab=${k}`} className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-semibold", tab === k ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{l}</Link>
        ))}
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        mobileTitle={(r) => r.vehicle.title}
        empty={<EmptyState icon={<Gavel className="h-7 w-7" />} title={tab === "live" ? "No active auctions" : tab === "scheduled" ? "No scheduled auctions" : "No ended auctions"} description="Start by listing your first vehicle with auction enabled." action={<ButtonLink href="/dashboard/vehicles/new">List Vehicle</ButtonLink>} />}
        columns={[
          { key: "v", header: "Vehicle", hideOnMobile: true, cell: (r) => <Link href={`/auctions/${r.id}`} className="font-semibold text-ink-900 hover:text-ignite-600">{r.vehicle.title}</Link> },
          { key: "b", header: "Current bid", align: "right", cell: (r) => <div><div className="font-bold text-ink-900">{r.currentBid ? formatINR(r.currentBid) : "—"}</div><div className="text-[11.5px] text-slate-400">{r.bidCount} bids · {r.bidderCount} bidders</div></div> },
          { key: "r", header: "Reserve", cell: (r) => (r.reservePrice ? <span className={(r.currentBid ?? 0) >= r.reservePrice ? "font-semibold text-verified-600" : "text-amber-700"}>{formatINR(r.reservePrice)} · {(r.currentBid ?? 0) >= r.reservePrice ? "met" : "not met"}</span> : "No reserve") },
          { key: "t", header: tab === "ended" ? "Ended" : "Time left", cell: (r) => (r.status === "LIVE" ? <AuctionTimer endAt={r.endAt.toISOString()} serverTime={now.toISOString()} /> : r.status === "SCHEDULED" ? `Starts ${formatDateTime(r.startAt)}` : formatDateTime(r.closedAt ?? r.endAt)) },
          { key: "s", header: "Result", cell: (r) => <div className="flex flex-col items-start gap-1"><StatusBadge status={r.result ?? r.status} />{r.extensionCount > 0 && <span className="text-[11px] text-slate-400">extended ×{r.extensionCount}</span>}</div> },
          {
            key: "a",
            header: "",
            align: "right",
            cell: (r) => {
              const withinWindow = r.closedAt && now.getTime() - r.closedAt.getTime() < acceptHours * 3600_000;
              if (r.result === "RESERVE_NOT_MET" && withinWindow && r.orders.length === 0)
                return (
                  <div className="flex justify-end gap-2">
                    <ActionButton url={`/api/auctions/${r.id}/accept`} label={`Accept ${formatINR(r.currentBid)}`} variant="primary" confirm={{ title: "Accept the highest bid?", body: `The vehicle will be sold for ${formatINR(r.currentBid)} (below your reserve) and an order created for the bidder.`, label: "Accept & sell" }} success="Bid accepted — order created" />
                    <ActionButton url={`/api/vehicles/${r.vehicle.id}/relist`} body={{ durationHours: 24 }} label="Relist" success="Auction relisted for 24 hours" confirm={{ title: "Relist for 24 hours?" }} />
                  </div>
                );
              if ((r.result === "NO_BIDS" || r.result === "RESERVE_NOT_MET") && r.vehicle.status === "AUCTION_ENDED")
                return <ActionButton url={`/api/vehicles/${r.vehicle.id}/relist`} body={{ durationHours: 24 }} label="Relist" success="Auction relisted for 24 hours" confirm={{ title: "Relist for 24 hours?" }} />;
              if (r.orders[0]) return <Link href={`/dashboard/orders/${r.orders[0].id}`} className="text-[13px] font-semibold text-ignite-600">View order</Link>;
              return <Link href={`/auctions/${r.id}`} className="text-[13px] font-semibold text-ignite-600">Open room</Link>;
            },
          },
        ]}
      />
    </div>
  );
}
