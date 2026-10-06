import Link from "next/link";
import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { requirePermission } from "@/server/auth/rbac";
import { getCurrentActor } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { Pills, SearchBox } from "../_filters";

export const metadata = { title: "Orders" };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string; payout?: string }> }) {
  requirePermission(await getCurrentActor(), "orders.manage");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.OrderWhereInput = {
    ...(sp.status ? { status: sp.status as OrderStatus } : {}),
    ...(sp.payout ? { payoutStatus: "PENDING" } : {}),
    ...(sp.q ? { OR: [{ orderNumber: { contains: sp.q.toUpperCase() } }, { vehicle: { searchText: { contains: sp.q.toLowerCase() } } }, { sellerDealer: { name: { contains: sp.q, mode: "insensitive" } } }, { buyerDealer: { name: { contains: sp.q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total, sums] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 25, take: 25, include: { vehicle: { select: { title: true } }, sellerDealer: { select: { name: true } }, buyerDealer: { select: { name: true } } } }),
    prisma.order.count({ where }),
    prisma.order.aggregate({ where, _sum: { vehiclePrice: true, buyerFee: true, sellerFee: true } }),
  ]);
  return (
    <div>
      <PageHeader title="Orders" subtitle={`${total} orders · GMV ${formatINR(sums._sum.vehiclePrice ?? 0)} · fees ${formatINR((sums._sum.buyerFee ?? 0) + (sums._sum.sellerFee ?? 0))}`} actions={<a href="/api/admin/reports/export?type=orders" className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:border-ink-900">Export CSV</a>} />
      <Pills base="/admin/orders" current={sp.payout ? "payout" : sp.status} extra={{ q: sp.q }} options={[["", "All"], ["PAYMENT_PENDING", "Payment pending"], ["PAYMENT_RECEIVED", "Paid"], ["DOCUMENTS_PENDING", "Docs pending"], ["IN_DELIVERY", "In delivery"], ["COMPLETED", "Completed"], ["DISPUTED", "Disputed"], ["CANCELLED", "Cancelled"]]} />
      <div className="mb-3 -mt-1"><Link href="/admin/orders?payout=1" className="text-[13px] font-semibold text-ignite-600">Show orders with payouts due →</Link></div>
      <SearchBox placeholder="Order no., vehicle or dealer" q={sp.q} hidden={{ status: sp.status }} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        mobileTitle={(r) => <Link href={`/admin/orders/${r.id}`}>{r.orderNumber}</Link>}
        empty={<EmptyState title="No orders" />}
        columns={[
          { key: "o", header: "Order", hideOnMobile: true, cell: (r) => <Link href={`/admin/orders/${r.id}`} className="font-mono text-[12.5px] font-semibold hover:text-ignite-600">{r.orderNumber}</Link> },
          { key: "v", header: "Vehicle", cell: (r) => <span className="block max-w-[220px] truncate">{r.vehicle.title}</span> },
          { key: "p", header: "Seller → Buyer", cell: (r) => <span className="text-[12.5px]">{r.sellerDealer.name} → {r.buyerDealer?.name ?? "—"}</span> },
          { key: "a", header: "Price", align: "right", cell: (r) => <span className="font-semibold">{formatINR(r.vehiclePrice)}</span> },
          { key: "f", header: "Fees", align: "right", cell: (r) => formatINR(r.buyerFee + r.sellerFee) },
          { key: "s", header: "Status", cell: (r) => <div className="flex flex-col items-start gap-0.5"><StatusBadge status={r.status} /><span className="text-[11px] text-slate-400">{humanize(r.source)} · {formatDate(r.createdAt)}</span></div> },
          { key: "y", header: "Payout", cell: (r) => <StatusBadge status={r.payoutStatus} /> },
        ]}
      />
      <Pagination page={page} pages={Math.ceil(total / 25)} basePath="/admin/orders" params={sp} />
    </div>
  );
}
