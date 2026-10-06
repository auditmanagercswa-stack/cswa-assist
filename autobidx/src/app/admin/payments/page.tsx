import Link from "next/link";
import type { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDateTime, formatINR, humanize } from "@/lib/format";
import { can, requirePermission } from "@/server/auth/rbac";
import { getCurrentActor } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty";
import { Pagination } from "@/components/ui/pagination";
import { ActionButton } from "@/components/ui/action-button";
import { Pills, SearchBox } from "../_filters";
import { RefundButton } from "./refund";

export const metadata = { title: "Payments & Refunds" };

export default async function AdminPayments({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const actor = requirePermission(await getCurrentActor(), "payments.manage");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.PaymentWhereInput = {
    ...(sp.status ? { status: sp.status as PaymentStatus } : { status: { not: "PENDING" } }),
    ...(sp.q ? { OR: [{ reference: { contains: sp.q.toUpperCase() } }, { gatewayPaymentId: { contains: sp.q } }, { user: { email: { contains: sp.q.toLowerCase() } } }] } : {}),
  };
  const [rows, total, refunds] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 25, take: 25, include: { user: { select: { name: true, email: true } }, dealer: { select: { name: true } }, order: { select: { id: true, orderNumber: true } } } }),
    prisma.payment.count({ where }),
    prisma.refund.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { payment: { select: { reference: true } } } }),
  ]);
  const canRefund = can(actor, "payments.refund");
  return (
    <div>
      <PageHeader title="Payments & Refunds" subtitle="Gateway-verified payments, bank-transfer reconciliation and refunds" actions={<a href="/api/admin/reports/export?type=payments" className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:border-ink-900">Export CSV</a>} />
      <Pills base="/admin/payments" current={sp.status} extra={{ q: sp.q }} options={[["", "All (excl. pending)"], ["PROCESSING", "Awaiting reconciliation"], ["PAID", "Paid"], ["FAILED", "Failed"], ["REFUNDED", "Refunded"], ["PARTIALLY_REFUNDED", "Partially refunded"], ["PENDING", "Pending"]]} />
      <SearchBox placeholder="Reference, UTR/gateway id or email" q={sp.q} hidden={{ status: sp.status }} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        mobileTitle={(r) => r.reference}
        empty={<EmptyState title="No payments" />}
        columns={[
          { key: "r", header: "Reference", hideOnMobile: true, cell: (r) => <div><div className="font-mono text-[12.5px] font-semibold">{r.reference}</div><div className="text-[11.5px] text-slate-400">{formatDateTime(r.createdAt)}</div></div> },
          { key: "f", header: "For", cell: (r) => (r.order ? <Link href={`/admin/orders/${r.order.id}`} className="hover:text-ignite-600">Order {r.order.orderNumber}</Link> : humanize(r.purpose)) },
          { key: "p", header: "Payer", cell: (r) => <div>{r.dealer?.name ?? r.user.name}<div className="text-[11.5px] text-slate-400">{r.user.email}</div></div> },
          { key: "m", header: "Method / gateway", cell: (r) => <div>{humanize(r.method ?? "—")}<div className="font-mono text-[11px] text-slate-400">{r.gateway} {r.gatewayPaymentId ?? ""}</div></div> },
          { key: "a", header: "Amount", align: "right", cell: (r) => <div><div className="font-bold">{formatINR(r.amount)}</div>{r.refundedAmount > 0 && <div className="text-[11.5px] text-slate-400">refunded {formatINR(r.refundedAmount)}</div>}</div> },
          { key: "s", header: "Status", cell: (r) => <div className="flex flex-col items-start gap-0.5"><StatusBadge status={r.status} />{r.failureReason && <span className="max-w-[160px] truncate text-[11px] text-red-600" title={r.failureReason}>{r.failureReason}</span>}</div> },
          {
            key: "x",
            header: "",
            align: "right",
            cell: (r) =>
              r.status === "PROCESSING" ? (
                <div className="flex justify-end gap-1.5">
                  <ActionButton url={`/api/admin/payments/${r.id}`} body={{ action: "confirm" }} label="Confirm receipt" variant="success" reason={{ label: "Reconciliation note (bank statement ref.)", field: "note" }} success="Payment confirmed" />
                  <ActionButton url={`/api/admin/payments/${r.id}`} body={{ action: "reject" }} label="Reject" danger reason={{ label: "Reason (sent to payer)", required: true }} success="Marked failed" />
                </div>
              ) : canRefund && (r.status === "PAID" || r.status === "PARTIALLY_REFUNDED") ? (
                <RefundButton id={r.id} max={r.amount - r.refundedAmount} />
              ) : null,
          },
        ]}
      />
      <Pagination page={page} pages={Math.ceil(total / 25)} basePath="/admin/payments" params={sp} />
      {refunds.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-sans text-[16px] font-bold text-ink-900">Recent refunds</h2>
          <ul className="divide-y divide-slate-100 rounded-[var(--radius-card)] border border-[var(--border)] bg-white text-[13.5px]">
            {refunds.map((f) => <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5"><span><span className="font-mono text-[12px]">{f.payment.reference}</span> · {f.reason}</span><span className="flex items-center gap-2"><b>{formatINR(f.amount)}</b><StatusBadge status={f.status === "PROCESSED" ? "PAID" : f.status} /></span></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
