import Link from "next/link";
import { Receipt } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { getCurrentActor } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty";
import { ButtonLink } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";

export const metadata = { title: "Orders & Transactions" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ side?: string; page?: string }> }) {
  const sp = await searchParams;
  const side = sp.side === "selling" ? "selling" : "buying";
  const page = Math.max(1, Number(sp.page) || 1);
  const actor = (await getCurrentActor())!;
  const where: Prisma.OrderWhereInput = side === "selling" ? { sellerDealerId: actor.dealer?.id ?? "none" } : { OR: [{ buyerId: actor.userId }, ...(actor.dealer ? [{ buyerDealerId: actor.dealer.id }] : [])] };
  const [rows, total] = await Promise.all([
    prisma.order.findMany({ where, include: { vehicle: { select: { title: true } }, sellerDealer: { select: { name: true } }, buyerDealer: { select: { name: true } }, buyer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 20 }),
    prisma.order.count({ where }),
  ]);
  return (
    <div>
      <PageHeader title="Orders & Transactions" subtitle="Every purchase and sale, from payment to handover" />
      <div className="mb-4 flex gap-1.5">
        {[["buying", "Purchases"], ["selling", "Sales"]].map(([k, l]) => (
          <Link key={k} href={`/dashboard/orders?side=${k}`} className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-semibold", side === k ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{l}</Link>
        ))}
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        mobileTitle={(r) => <Link href={`/dashboard/orders/${r.id}`}>{r.vehicle.title}</Link>}
        empty={<EmptyState icon={<Receipt className="h-7 w-7" />} title={side === "buying" ? "No purchases yet" : "No sales yet"} description={side === "buying" ? "Win an auction, buy now or get an offer accepted to see orders here." : "List vehicles to start selling."} action={<ButtonLink href={side === "buying" ? "/auctions" : "/dashboard/vehicles/new"}>{side === "buying" ? "Browse auctions" : "List a vehicle"}</ButtonLink>} />}
        columns={[
          { key: "o", header: "Order", cell: (r) => <Link href={`/dashboard/orders/${r.id}`} className="font-mono text-[12.5px] font-semibold text-ink-900 hover:text-ignite-600">{r.orderNumber}</Link> },
          { key: "v", header: "Vehicle", hideOnMobile: true, cell: (r) => <Link href={`/dashboard/orders/${r.id}`} className="font-semibold text-ink-900 hover:text-ignite-600">{r.vehicle.title}</Link> },
          { key: "p", header: side === "buying" ? "Seller" : "Buyer", cell: (r) => (side === "buying" ? r.sellerDealer.name : (r.buyerDealer?.name ?? r.buyer.name)) },
          { key: "t", header: side === "buying" ? "You pay" : "You receive", align: "right", cell: (r) => <span className="font-bold text-ink-900">{formatINR(side === "buying" ? r.buyerTotal : r.sellerNet)}</span> },
          { key: "s", header: "Status", cell: (r) => <div className="flex flex-col items-start gap-1"><StatusBadge status={r.status} /><span className="text-[11.5px] text-slate-400">{humanize(r.source)} · {formatDate(r.createdAt)}</span></div> },
          { key: "a", header: "", align: "right", cell: (r) => (side === "buying" && r.status === "PAYMENT_PENDING" ? <ButtonLink href={`/checkout/${r.id}`} size="sm">Pay now</ButtonLink> : <Link href={`/dashboard/orders/${r.id}`} className="text-[13px] font-semibold text-ignite-600">Details</Link>) },
        ]}
      />
      <Pagination page={page} pages={Math.ceil(total / 20)} basePath="/dashboard/orders" params={sp} />
    </div>
  );
}
