import Link from "next/link";
import { Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { getCurrentActor } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty";
import { DashboardCard } from "@/components/ui/stat";
import { PayChargeButton } from "./pay-charge";

export const metadata = { title: "Payments & Fees" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { payment } = await searchParams;
  const actor = (await getCurrentActor())!;
  const dealerId = actor.dealer?.id ?? "none";
  const [payments, charges, invoices, methods, feesPaid, received] = await Promise.all([
    prisma.payment.findMany({ where: { OR: [{ userId: actor.userId }, { dealerId }], status: { not: "PENDING" } }, orderBy: { createdAt: "desc" }, take: 50, include: { order: { select: { orderNumber: true, id: true } } } }),
    prisma.payment.findMany({ where: { dealerId, purpose: { in: ["LISTING_FEE", "AUCTION_FEE"] }, status: { in: ["PENDING", "FAILED"] } }, orderBy: { createdAt: "desc" } }),
    prisma.invoice.findMany({ where: { dealerId }, orderBy: { issuedAt: "desc" }, take: 50, include: { order: { select: { orderNumber: true } } } }),
    getSetting("payments.enabledMethods"),
    prisma.invoice.aggregate({ where: { dealerId, type: { in: ["SELLER_FEE_INVOICE", "SERVICE_INVOICE"] }, OR: [{ order: { paymentStatus: "PAID" } }, { payment: { status: "PAID" } }] }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { sellerDealerId: dealerId, payoutStatus: "RELEASED" }, _sum: { sellerNet: true } }),
  ]);
  const vehicleTitles = new Map((await prisma.vehicle.findMany({ where: { id: { in: charges.map((c) => c.targetId!).filter(Boolean) } }, select: { id: true, title: true } })).map((v) => [v.id, v.title]));
  return (
    <div>
      <PageHeader title="Payments & Fees" subtitle="Payments, platform fees, payouts and invoices" />
      {payment === "paid" && <div className="mb-4 rounded-xl bg-verified-50 px-4 py-3 text-[14px] font-semibold text-verified-600">Payment verified. Thank you!</div>}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <DashboardCard label="Outstanding fees" value={formatINR(charges.reduce((s, c) => s + c.amount, 0))} sub={`${charges.length} pending charge(s)`} tone="amber" />
        <DashboardCard label="Platform fees invoiced (paid)" value={formatINR(feesPaid._sum.total ?? 0)} />
        <DashboardCard label="Payouts released" value={formatINR(received._sum.sellerNet ?? 0)} tone="green" />
      </div>
      {charges.length > 0 && (
        <Card className="mb-5">
          <CardHeader title="Pending platform charges" subtitle="Listing and auction fees as per your plan" />
          <ul className="divide-y divide-slate-100">
            {charges.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div><div className="font-semibold text-ink-900">{humanize(c.purpose)} · {vehicleTitles.get(c.targetId ?? "") ?? "Vehicle"}</div><div className="text-[12px] text-slate-500">{c.reference} · {formatDate(c.createdAt)}{c.status === "FAILED" ? " · last attempt failed" : ""}</div></div>
                <PayChargeButton id={c.id} purpose={c.purpose as "LISTING_FEE" | "AUCTION_FEE"} amount={c.amount} methods={methods} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      <h2 className="mb-3 font-sans text-[16px] font-bold text-ink-900">Payment history</h2>
      <DataTable
        rows={payments}
        rowKey={(r) => r.id}
        mobileTitle={(r) => r.reference}
        empty={<EmptyState icon={<Wallet className="h-7 w-7" />} title="No payments yet" description="Payments for purchases, plans and fees will appear here." />}
        columns={[
          { key: "r", header: "Reference", hideOnMobile: true, cell: (r) => <span className="font-mono text-[12.5px]">{r.reference}</span> },
          { key: "p", header: "For", cell: (r) => (r.order ? <Link href={`/dashboard/orders/${r.order.id}`} className="font-semibold text-ink-900 hover:text-ignite-600">Order {r.order.orderNumber}</Link> : humanize(r.purpose)) },
          { key: "m", header: "Method", cell: (r) => humanize(r.method ?? "—") },
          { key: "d", header: "Date", cell: (r) => formatDate(r.createdAt) },
          { key: "a", header: "Amount", align: "right", cell: (r) => <span className="font-semibold">{formatINR(r.amount)}</span> },
          { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
      <h2 className="mb-3 mt-8 font-sans text-[16px] font-bold text-ink-900">Invoices</h2>
      <DataTable
        rows={invoices}
        rowKey={(r) => r.id}
        mobileTitle={(r) => r.number}
        empty={<EmptyState title="No invoices yet" description="GST invoices are generated automatically for every transaction and service." />}
        columns={[
          { key: "n", header: "Invoice", cell: (r) => <span className="font-mono text-[12.5px]">{r.number}</span> },
          { key: "t", header: "Type", cell: (r) => humanize(r.type) },
          { key: "o", header: "Order", cell: (r) => r.order?.orderNumber ?? "—" },
          { key: "d", header: "Date", cell: (r) => formatDate(r.issuedAt) },
          { key: "a", header: "Total", align: "right", cell: (r) => <span className="font-semibold">{formatINR(r.total)}</span> },
          { key: "x", header: "", align: "right", cell: (r) => <a href={`/api/invoices/${r.id}`} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-ignite-600">Download PDF</a> },
        ]}
      />
    </div>
  );
}
