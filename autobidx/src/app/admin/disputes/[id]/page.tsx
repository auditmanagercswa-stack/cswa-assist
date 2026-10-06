import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { formatDateTime, formatINR, humanize } from "@/lib/format";
import { requirePermission } from "@/server/auth/rbac";
import { getCurrentActor } from "@/server/auth/session";
import { getDisputeForActor } from "@/server/services/disputes";
import { AppError } from "@/lib/errors";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { DisputeThread } from "@/components/dashboard/order-widgets";
import { DisputeResolver } from "./resolver";

export const metadata = { title: "Dispute" };

export default async function AdminDispute({ params }: { params: Promise<{ id: string }> }) {
  const actor = requirePermission(await getCurrentActor(), "disputes.manage");
  const { id } = await params;
  let d;
  try {
    d = await getDisputeForActor(id, actor);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const paid = d.order.payments.find((p) => p.status === "PAID" || p.status === "PARTIALLY_REFUNDED");
  const closed = ["RESOLVED", "REFUNDED", "CLOSED"].includes(d.status);
  return (
    <div>
      <Link href="/admin/disputes" className="mb-4 inline-flex items-center gap-1 text-[13.5px] font-semibold text-slate-600 hover:text-ink-900"><ChevronLeft className="h-4 w-4" />Disputes</Link>
      <PageHeader eyebrow={<span className="flex items-center gap-2">{d.number} <StatusBadge status={d.status} /></span>} title={d.subject} subtitle={<>{humanize(d.category)} · raised by {d.raisedBy.name} ({d.raisedByParty.toLowerCase()}) · {formatDateTime(d.createdAt)} · <Link href={`/admin/orders/${d.orderId}`} className="font-semibold underline">Order {d.order.orderNumber}</Link> · {d.order.vehicle.title}</>} />
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Conversation" subtitle="Messages are visible to both parties; internal notes are admin-only" />
          <DisputeThread isAdmin dispute={{ id: d.id, number: d.number, status: d.status, subject: d.subject, messages: d.messages.map((m) => ({ id: m.id, body: m.body, internal: m.internal, kind: m.kind, createdAt: m.createdAt.toISOString(), author: m.author.name, isStaff: ["ADMIN", "SUPER_ADMIN"].includes(m.author.role.key) })) }} />
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Order snapshot" />
            <dl className="grid grid-cols-2 gap-3 text-[13.5px]">
              <div><dt className="text-slate-500">Order status</dt><dd><StatusBadge status={d.order.status} /></dd></div>
              <div><dt className="text-slate-500">Before dispute</dt><dd className="font-semibold">{humanize(d.previousOrderStatus ?? "—")}</dd></div>
              <div><dt className="text-slate-500">Buyer paid</dt><dd className="font-semibold">{formatINR(d.order.buyerTotal)}</dd></div>
              <div><dt className="text-slate-500">Refundable</dt><dd className="font-semibold">{paid ? formatINR(paid.amount - paid.refundedAmount) : "—"}</dd></div>
              <div><dt className="text-slate-500">Seller net</dt><dd className="font-semibold">{formatINR(d.order.sellerNet)}</dd></div>
              <div><dt className="text-slate-500">Payout</dt><dd><StatusBadge status={d.order.payoutStatus} /></dd></div>
            </dl>
          </Card>
          {closed ? (
            <Card><CardHeader title="Resolution" /><p className="text-sm text-slate-700">{d.resolution}</p>{d.penaltyAmount ? <p className="mt-2 text-sm text-slate-600">Penalty: {formatINR(d.penaltyAmount)} on {d.penaltyParty?.toLowerCase()}</p> : null}</Card>
          ) : (
            <Card><CardHeader title="Take action" /><DisputeResolver id={d.id} status={d.status} refundable={paid ? paid.amount - paid.refundedAmount : 0} /></Card>
          )}
        </div>
      </div>
    </div>
  );
}
