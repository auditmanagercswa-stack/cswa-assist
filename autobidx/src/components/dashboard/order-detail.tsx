import Link from "next/link";
import { Check, Download, FileText, Truck } from "lucide-react";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import { formatDateTime, formatINR, humanize } from "@/lib/format";
import { vehiclePath } from "@/lib/slug";
import { ORDER_FLOW, ORDER_STATUS_LABEL, allowedTransitions, type OrderRole, getOrderForActor } from "@/server/services/orders";
import type { Actor } from "@/server/auth/rbac";
import { Card, CardHeader } from "../ui/card";
import { StatusBadge } from "../ui/badge";
import { ButtonLink } from "../ui/button";
import { ActionButton } from "../ui/action-button";
import { FeeBreakdown, type Breakdown } from "../vehicles/fee-breakdown";
import { AuctionTimer } from "../auction/auction-timer";
import { DisputeThread, OrderActions, OrderDocUpload, RaiseDispute, ReviewDone, ReviewForm } from "./order-widgets";

type Loaded = Awaited<ReturnType<typeof getOrderForActor>>;

export async function OrderDetail({ data, actor, admin = false }: { data: Loaded; actor: Actor; admin?: boolean }) {
  const { order, role } = data;
  const fb = order.feeBreakdown as unknown as Breakdown;
  const actions = allowedTransitions(order.status, role as OrderRole);
  const flowIdx = ORDER_FLOW.indexOf(order.status === "DISPUTED" ? "VEHICLE_READY" : order.status);
  const disputes = await prisma.dispute.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" },
    include: { messages: { where: admin ? {} : { internal: false }, orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, role: { select: { key: true } } } } } } },
  });
  const openDispute = disputes.find((d) => ["OPEN", "INVESTIGATING", "AWAITING_DOCUMENTS"].includes(d.status));
  const myReview = order.reviews.find((r) => r.authorId === actor.userId);
  const canDispute = (role === "buyer" || role === "seller") && !openDispute && !["CANCELLED", "PAYMENT_PENDING"].includes(order.status);
  const img = order.vehicle.images[0];
  const docLabel: Record<string, string> = { INVOICE: role === "seller" ? "Platform fee invoice" : "Tax invoice (buyer)", SALE_AGREEMENT: "Sale agreement", PAYMENT_RECEIPT: "Payment receipt", DELIVERY_CHALLAN: "Delivery challan", RC: "RC copy", INSURANCE: "Insurance copy", INSPECTION_REPORT: "Inspection report", OTHER: "Document" };
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {img && <img src={img.thumbUrl ?? img.url} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[13px] font-semibold text-slate-500">{order.orderNumber}</span><StatusBadge status={order.status} /><StatusBadge status={order.paymentStatus} /></div>
          <Link href={vehiclePath(order.vehicle)} className="mt-1 block text-[18px] font-bold text-ink-900 hover:text-ignite-600">{order.vehicle.title}</Link>
          <div className="text-[13px] text-slate-500">{humanize(order.source)} · {formatDateTime(order.createdAt)} · Seller {order.sellerDealer.name} · Buyer {order.buyerDealer?.name ?? order.buyer.name}</div>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          {role === "buyer" && order.status === "PAYMENT_PENDING" && (
            <>
              <ButtonLink href={`/checkout/${order.id}`} size="lg">Pay {formatINR(order.buyerTotal)}</ButtonLink>
              <span className="text-[12px] text-amber-700">Due in <AuctionTimer endAt={order.paymentDueAt.toISOString()} serverTime={new Date().toISOString()} className="text-[12px]" /></span>
            </>
          )}
        </div>
      </div>

      {/* Progress */}
      <Card>
        <CardHeader title="Order progress" subtitle={order.status === "CANCELLED" ? `Cancelled: ${order.cancelReason ?? ""}` : order.status === "DISPUTED" ? "Paused while a dispute is investigated" : undefined} />
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {ORDER_FLOW.map((s, i) => {
            const done = order.status !== "CANCELLED" && i <= flowIdx;
            const current = i === flowIdx && order.status !== "COMPLETED" && order.status !== "CANCELLED";
            const h = order.history.find((x) => x.to === s);
            return (
              <li key={s} className="flex items-start gap-2">
                <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", done ? (current ? "bg-ignite-500 text-white" : "bg-verified-500 text-white") : "bg-slate-200 text-slate-500")}>{done && !current ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                <span>
                  <span className={cn("block text-[12.5px] font-semibold leading-tight", done ? "text-ink-900" : "text-slate-400")}>{i === 0 ? (order.source === "AUCTION" ? "Auction won → payment" : "Payment pending") : ORDER_STATUS_LABEL[s]}</span>
                  {h && <span className="block text-[11px] text-slate-400">{formatDateTime(h.createdAt)}</span>}
                </span>
              </li>
            );
          })}
        </ol>
        {(actions.length > 0 || canDispute) && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <OrderActions orderId={order.id} actions={actions} apiBase={admin ? "/api/admin/orders" : "/api/orders"} />
            {canDispute && !admin && <RaiseDispute orderId={order.id} party={role as "buyer" | "seller"} />}
          </div>
        )}
        {order.deliveryMode && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600"><Truck className="h-4 w-4" />{order.deliveryMode === "PICKUP" ? "Buyer pickup" : "Delivery"} · {order.deliveryDate ? formatDateTime(order.deliveryDate) : "date TBC"} · {humanize(order.deliveryStatus)}</div>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Transaction breakdown" subtitle="Fees locked when the order was created" />
          <FeeBreakdown b={fb} show={role === "buyer" ? "buyer" : role === "seller" ? "seller" : "both"} priceLabel={order.source === "AUCTION" ? "Winning bid" : "Vehicle price"} />
          {role !== "buyer" && <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[13px]"><span className="text-slate-600">Seller payout</span><StatusBadge status={order.payoutStatus} /></div>}
          {admin && order.payoutStatus === "PENDING" && <div className="mt-3"><ActionButton url={`/api/admin/orders/${order.id}`} body={{ action: "release_payout" }} label={`Release payout ${formatINR(order.sellerNet)}`} variant="success" confirm={{ title: "Release seller payout?", body: "Marks the payout as released. Bank transfer integration is pending; record the UTR in your finance system." }} success="Payout released" /></div>}
        </Card>
        <Card>
          <CardHeader title="Documents" subtitle="Generated instantly · uploaded files are private to this order" />
          <ul className="divide-y divide-slate-100">
            {order.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-[14px]"><FileText className="h-4 w-4 shrink-0 text-slate-400" /><span className="truncate">{docLabel[d.type] ?? d.title}</span>{!d.generated && <span className="rounded bg-slate-100 px-1.5 text-[11px] text-slate-500">uploaded</span>}</span>
                <span className="flex shrink-0 gap-2">
                  <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-ink-900 hover:text-ignite-600">View</a>
                  <a href={`/api/documents/${d.id}?download=1`} className="text-slate-400 hover:text-ink-900" aria-label="Download"><Download className="h-4 w-4" /></a>
                </span>
              </li>
            ))}
          </ul>
          {(role === "seller" || role === "admin") && !["CANCELLED", "PAYMENT_PENDING"].includes(order.status) && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <OrderDocUpload orderId={order.id} types={[{ value: "RC", label: "RC copy" }, { value: "INSURANCE", label: "Insurance" }, { value: "SALE_AGREEMENT", label: "Signed sale agreement" }, { value: "OTHER", label: "Other" }]} />
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Payments" />
          {order.payments.length === 0 ? <p className="text-sm text-slate-500">No payments yet.</p> : (
            <ul className="divide-y divide-slate-100 text-[13.5px]">
              {order.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div><div className="font-mono text-[12.5px] font-semibold">{p.reference}</div><div className="text-[12px] text-slate-500">{humanize(p.method ?? "")} · {formatDateTime(p.createdAt)}{p.failureReason ? ` · ${p.failureReason}` : ""}</div></div>
                  <div className="text-right"><div className="num font-semibold">{formatINR(p.amount)}</div><StatusBadge status={p.status} />{p.refundedAmount > 0 && <div className="text-[11.5px] text-slate-500">refunded {formatINR(p.refundedAmount)}</div>}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="History" />
          <ol className="space-y-2.5 text-[13px]">
            {order.history.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-3">
                <span><b className="text-ink-900">{ORDER_STATUS_LABEL[h.to]}</b>{h.note ? <span className="text-slate-500"> — {h.note}</span> : null}</span>
                <span className="shrink-0 text-[12px] text-slate-400">{formatDateTime(h.createdAt)}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {disputes.length > 0 && (
        <Card>
          {disputes.map((d) => (
            <div key={d.id} className="mb-6 last:mb-0">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div><div className="text-[12px] font-bold uppercase tracking-wide text-red-600">Dispute {d.number}</div><div className="font-bold text-ink-900">{d.subject}</div><div className="text-[12.5px] text-slate-500">{humanize(d.category)} · raised by {d.raisedByParty.toLowerCase()} · {formatDateTime(d.createdAt)}</div></div>
                <StatusBadge status={d.status} />
              </div>
              {d.resolution && <div className="mb-3 rounded-lg bg-verified-50 p-3 text-[13.5px] text-verified-600"><b>Resolution:</b> {d.resolution}</div>}
              {admin ? <Link href={`/admin/disputes/${d.id}`} className="text-sm font-semibold text-ignite-600">Open in dispute console →</Link> : (
                <DisputeThread dispute={{ id: d.id, number: d.number, status: d.status, subject: d.subject, messages: d.messages.map((m) => ({ id: m.id, body: m.body, internal: m.internal, kind: m.kind, createdAt: m.createdAt.toISOString(), author: m.author.name, isStaff: ["ADMIN", "SUPER_ADMIN"].includes(m.author.role.key) })) }} />
              )}
            </div>
          ))}
        </Card>
      )}

      {order.status === "COMPLETED" && (role === "buyer" || role === "seller") && (order.buyerDealerId || role === "buyer") && (
        <Card>
          <CardHeader title="Rate this transaction" subtitle="Reviews are only possible on completed transactions" />
          {myReview ? <ReviewDone rating={myReview.rating} comment={myReview.comment} /> : role === "seller" && !order.buyerDealerId ? null : <ReviewForm orderId={order.id} subject={role === "buyer" ? order.sellerDealer.name : (order.buyerDealer?.name ?? "the buyer")} />}
        </Card>
      )}
    </div>
  );
}
