import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Clock, Lock, ShieldCheck } from "lucide-react";
import { getCurrentActor } from "@/server/auth/session";
import { getOrderForActor } from "@/server/services/orders";
import { getSetting } from "@/server/settings";
import { formatDateTime, formatINR, humanize } from "@/lib/format";
import { AppError } from "@/lib/errors";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { FeeBreakdown, type Breakdown } from "@/components/vehicles/fee-breakdown";
import { PaymentForm } from "@/components/dashboard/payment-form";
import { AuctionTimer } from "@/components/auction/auction-timer";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const actor = await getCurrentActor();
  if (!actor) redirect(`/login?next=/checkout/${orderId}`);
  let data;
  try {
    data = await getOrderForActor(orderId, actor);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const { order, role } = data;
  if (role !== "buyer") redirect(`/dashboard/orders/${orderId}`);
  const methods = await getSetting("payments.enabledMethods");
  const fb = order.feeBreakdown as unknown as Breakdown;
  const pendingTransfer = order.payments.find((p) => p.status === "PROCESSING");
  const lastFailed = order.payments.find((p) => p.status === "FAILED");
  const img = order.vehicle.images[0];
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-bold uppercase tracking-wider text-ignite-600">Secure checkout</div>
          <h1 className="text-[28px] font-bold text-ink-900">Order {order.orderNumber}</h1>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-5">
          <Card>
            <div className="flex gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {img && <img src={img.thumbUrl ?? img.url} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0">
                <div className="font-bold text-ink-900">{order.vehicle.title}</div>
                <div className="text-[13px] text-slate-500">Seller: {order.sellerDealer.name}</div>
                <div className="text-[13px] text-slate-500">{humanize(order.source)} · {formatDateTime(order.createdAt)}</div>
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="mb-2 font-sans text-[16px] font-bold text-ink-900">Payment breakdown</h2>
            <FeeBreakdown b={fb} priceLabel={order.source === "AUCTION" ? "Winning bid" : "Vehicle price"} />
            <p className="mt-3 text-[12px] text-slate-500">Fees were calculated by Alpha Cars when the order was created and are locked for this order. GST invoice available after creation in your order documents.</p>
          </Card>
          <div className="grid gap-3 text-[13px] text-slate-600 sm:grid-cols-3">
            <div className="flex items-start gap-2"><Lock className="mt-0.5 h-4 w-4 text-verified-500" />Payment held by Alpha Cars until delivery is confirmed</div>
            <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-verified-500" />Dispute protection before handover</div>
            <div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-verified-500" />Invoice, agreement & receipt generated automatically</div>
          </div>
        </div>
        <div>
          <Card className="lg:sticky lg:top-20">
            {order.status !== "PAYMENT_PENDING" ? (
              <div className="text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-verified-500" />
                <div className="mt-2 text-lg font-bold text-ink-900">{order.paymentStatus === "PAID" ? "Payment received" : `Order ${humanize(order.status).toLowerCase()}`}</div>
                <Link href={`/dashboard/orders/${order.id}`} className="mt-4 inline-flex h-11 items-center rounded-lg bg-ink-900 px-5 text-sm font-bold text-white">Track order</Link>
              </div>
            ) : (
              <>
                <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Amount payable</div>
                <div className="num text-[32px] font-bold text-ink-900">{formatINR(order.buyerTotal)}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[13px] text-amber-700"><Clock className="h-4 w-4" />Pay within <AuctionTimer endAt={order.paymentDueAt.toISOString()} serverTime={new Date().toISOString()} className="text-[13px]" /></div>
                {lastFailed && !pendingTransfer && <div className="mt-3 rounded-lg bg-red-50 p-3 text-[13px] text-red-700">Payment failed: {lastFailed.failureReason ?? "declined"}. Please try again.</div>}
                <div className="mt-5">
                  {pendingTransfer ? (
                    <div className="rounded-lg bg-blue-50 p-4 text-[13.5px] text-blue-900">Bank transfer <b>{pendingTransfer.reference}</b> (UTR {pendingTransfer.gatewayPaymentId}) is awaiting confirmation by our finance team.</div>
                  ) : (
                    <PaymentForm target={{ orderId: order.id }} methods={methods} amount={order.buyerTotal} />
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
