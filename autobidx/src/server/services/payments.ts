import { prisma, type Tx } from "@/lib/db";
import { AppError, conflict, forbidden, notFound } from "@/lib/errors";
import { formatINR } from "@/lib/format";
import { invoiceNumber, paymentReference, shortCode } from "@/lib/ids";
import type { Payment, PaymentMethod, PaymentPurpose, Prisma } from "@prisma/client";
import type { Actor } from "../auth/rbac";
import { can } from "../auth/rbac";
import { audit } from "../audit";
import { notify, notifyDealer } from "../notifications/notify";
import { getSetting } from "../settings";
import { getGateway, onlineGateway } from "../payments";
import { GatewaySignatureError, type GatewayEvent } from "../payments/gateway";
import { markOrderPaidTx, orderRoleFor } from "./orders";
import { flagFailedPayments } from "./fraud";
import { quoteServiceFee } from "./fees";

/**
 * Payment rules:
 *  - The amount is always derived server-side from the order / fee engine — never from the client.
 *  - A payment becomes PAID only from a signature-verified gateway event (webhook or callback),
 *    or an admin's manual bank-transfer reconciliation. Never from a frontend flag.
 *  - Webhooks are idempotent (PaymentEvent unique on gateway+eventId).
 */

export async function initiateOrderPayment(input: { orderId: string; actor: Actor; method: PaymentMethod; ip?: string | null }) {
  const enabled = await getSetting("payments.enabledMethods");
  if (!enabled.includes(input.method)) throw new AppError("VALIDATION", "This payment method is not available.");
  const order = await prisma.order.findUnique({ where: { id: input.orderId }, include: { vehicle: true, buyer: true } });
  if (!order) throw notFound("Order not found.");
  if (orderRoleFor(input.actor, order) !== "buyer") throw forbidden("Only the buyer can pay for this order.");
  if (order.status !== "PAYMENT_PENDING") throw conflict(order.paymentStatus === "PAID" ? "This order is already paid." : "This order is not awaiting payment.");
  if (order.paymentDueAt < new Date()) throw conflict("The payment window for this order has expired.");

  const inflight = await prisma.payment.findFirst({ where: { orderId: order.id, status: "PROCESSING" } });
  if (inflight) throw conflict("A bank transfer for this order is awaiting confirmation.");

  return createPayment({
    purpose: "ORDER",
    orderId: order.id,
    userId: input.actor.userId,
    dealerId: order.buyerDealerId,
    amount: order.buyerTotal, // authoritative server-side amount
    method: input.method,
    description: `${order.orderNumber} · ${order.vehicle.title}`,
    customer: { name: order.buyer.name, email: order.buyer.email, phone: order.buyer.phone },
    ip: input.ip,
  });
}

/** Service payments: listing fee, featured listing, subscription. Amount from fee engine / plan table. */
export async function initiateServicePayment(input: { actor: Actor; purpose: Exclude<PaymentPurpose, "ORDER">; targetId: string; method: PaymentMethod; ip?: string | null }) {
  const dealer = input.actor.dealer;
  if (!dealer) throw forbidden("A dealership is required.");
  const enabled = await getSetting("payments.enabledMethods");
  if (!enabled.includes(input.method)) throw new AppError("VALIDATION", "This payment method is not available.");

  let amount = 0;
  let description = "";
  let existing: Payment | null = null;
  if (input.purpose === "SUBSCRIPTION") {
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: input.targetId } });
    if (!plan || !plan.active) throw notFound("Plan not found.");
    const gst = await getSetting("gst.rateBps");
    amount = plan.priceMonthly + Math.round((plan.priceMonthly * gst) / 10000);
    description = `${plan.name} plan — 1 month`;
  } else if (input.purpose === "FEATURED_LISTING") {
    const v = await prisma.vehicle.findUnique({ where: { id: input.targetId } });
    if (!v || v.dealerId !== dealer.id) throw notFound("Vehicle not found.");
    if (!["PUBLISHED", "AUCTION_LIVE"].includes(v.status)) throw conflict("Only live listings can be featured.");
    const q = await quoteServiceFee("FEATURED", dealer.id, v.expectedPrice);
    if (q.total <= 0) throw conflict("Featured listings are free on your plan — contact support to enable.");
    amount = q.total;
    description = `Featured listing — ${v.title}`;
  } else {
    // LISTING_FEE / AUCTION_FEE: pay an existing pending charge
    existing = await prisma.payment.findFirst({ where: { id: input.targetId, dealerId: dealer.id, purpose: input.purpose, status: { in: ["PENDING", "FAILED"] } } });
    if (!existing) throw notFound("No pending charge found.");
    amount = existing.amount;
    description = existing.purpose === "LISTING_FEE" ? "Listing fee" : "Auction fee";
  }
  if (amount <= 0) throw conflict("Nothing to pay.");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.actor.userId } });
  return createPayment({
    purpose: input.purpose,
    userId: user.id,
    dealerId: dealer.id,
    amount,
    method: input.method,
    targetId: input.purpose === "LISTING_FEE" || input.purpose === "AUCTION_FEE" ? (existing!.targetId ?? undefined) : input.targetId,
    description,
    customer: { name: user.name, email: user.email, phone: user.phone },
    reuse: existing,
    ip: input.ip,
  });
}

async function createPayment(p: {
  purpose: PaymentPurpose;
  orderId?: string;
  userId: string;
  dealerId: string | null;
  amount: number;
  method: PaymentMethod;
  targetId?: string;
  description: string;
  customer: { name: string; email: string; phone: string };
  reuse?: Payment | null;
  ip?: string | null;
}) {
  const gateway = p.method === "BANK_TRANSFER" ? getGateway("bank_transfer") : onlineGateway();
  const payment = p.reuse
    ? await prisma.payment.update({ where: { id: p.reuse.id }, data: { method: p.method, gateway: gateway.name, status: "PENDING", failureReason: null } })
    : await prisma.payment.create({
        data: { reference: paymentReference(), purpose: p.purpose, orderId: p.orderId, userId: p.userId, dealerId: p.dealerId, amount: p.amount, method: p.method, gateway: gateway.name, targetId: p.targetId },
      });
  const result = await gateway.createOrder({ paymentId: payment.id, reference: payment.reference, amount: payment.amount, method: p.method, customer: p.customer, description: p.description });
  await prisma.payment.update({ where: { id: payment.id }, data: { gatewayOrderId: result.gatewayOrderId } });
  await audit({ userId: p.userId, action: "payment.initiate", entityType: "Payment", entityId: payment.id, after: { amount: payment.amount, method: p.method, gateway: gateway.name, purpose: p.purpose }, ip: p.ip });
  return {
    paymentId: payment.id,
    reference: payment.reference,
    amount: payment.amount,
    gateway: gateway.name,
    redirectUrl: result.redirectUrl,
    clientPayload: result.clientPayload ?? null,
    offline: !!result.offline,
    bankDetails: result.offline ? await getSetting("payments.bankTransferDetails") : null,
  };
}

/** Buyer submits a UTR for a bank transfer → PROCESSING (awaiting finance reconciliation). */
export async function submitBankTransferUtr(paymentId: string, actor: Actor, utr: string) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p || p.userId !== actor.userId) throw notFound("Payment not found.");
  if (p.gateway !== "bank_transfer" || p.status !== "PENDING") throw conflict("This payment can't accept a UTR.");
  if (!/^[A-Za-z0-9]{8,22}$/.test(utr)) throw new AppError("VALIDATION", "Enter a valid UTR / reference number.");
  await prisma.payment.update({ where: { id: paymentId }, data: { status: "PROCESSING", gatewayPaymentId: utr.toUpperCase(), meta: { utrSubmittedAt: new Date().toISOString() } } });
  await audit({ userId: actor.userId, action: "payment.utr_submitted", entityType: "Payment", entityId: paymentId, after: { utr } });
  return { ok: true };
}

/** Finance admin confirms a reconciled bank transfer. */
export async function confirmBankTransfer(paymentId: string, actor: Actor, note: string) {
  if (!can(actor, "payments.manage")) throw forbidden();
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p) throw notFound();
  if (p.gateway !== "bank_transfer" || p.status !== "PROCESSING") throw conflict("Only bank transfers awaiting confirmation can be confirmed.");
  await prisma.$transaction(async (tx) => {
    await applyPaymentSuccessTx(tx, p, p.gatewayPaymentId ?? `manual_${shortCode(6)}`);
    await audit({ userId: actor.userId, action: "payment.manual_confirm", entityType: "Payment", entityId: paymentId, after: { note } }, tx);
  });
}

export async function rejectBankTransfer(paymentId: string, actor: Actor, reason: string) {
  if (!can(actor, "payments.manage")) throw forbidden();
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!p || p.status !== "PROCESSING") throw conflict("Payment is not awaiting confirmation.");
  await prisma.payment.update({ where: { id: paymentId }, data: { status: "FAILED", failureReason: reason } });
  await audit({ userId: actor.userId, action: "payment.manual_reject", entityType: "Payment", entityId: paymentId, after: { reason } });
  await notify(p.userId, { type: "PAYMENT_FAILED", title: "Bank transfer not matched", body: `We couldn't match your transfer (${p.reference}): ${reason}`, link: p.orderId ? `/dashboard/orders/${p.orderId}` : "/dashboard/payments" });
}

/** Single place where a payment becomes PAID and side-effects run. Idempotent. */
async function applyPaymentSuccessTx(tx: Tx, payment: Payment, gatewayPaymentId: string, paidAmount?: number) {
  const rows = await tx.$queryRaw<Payment[]>`SELECT * FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;
  const p = rows[0];
  if (!p) throw notFound();
  if (p.status === "PAID" || p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED") return p; // idempotent
  if (paidAmount != null && paidAmount !== p.amount) {
    await tx.payment.update({ where: { id: p.id }, data: { status: "FAILED", failureReason: `Amount mismatch: expected ${p.amount}, got ${paidAmount}` } });
    await audit({ action: "payment.amount_mismatch", entityType: "Payment", entityId: p.id, after: { expected: p.amount, got: paidAmount } }, tx);
    return p;
  }
  const updated = await tx.payment.update({ where: { id: p.id }, data: { status: "PAID", gatewayPaymentId, verifiedAt: new Date(), failureReason: null } });
  await audit({ userId: p.userId, action: "payment.paid", entityType: "Payment", entityId: p.id, after: { amount: p.amount, gatewayPaymentId } }, tx);

  switch (p.purpose) {
    case "ORDER":
      if (p.orderId) await markOrderPaidTx(tx, p.orderId, p.id);
      break;
    case "SUBSCRIPTION": {
      const plan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { id: p.targetId! } });
      await tx.subscription.updateMany({ where: { dealerId: p.dealerId!, status: "ACTIVE" }, data: { status: "CANCELLED", endAt: new Date() } });
      await tx.subscription.create({ data: { dealerId: p.dealerId!, planId: plan.id, status: "ACTIVE", startAt: new Date(), endAt: new Date(Date.now() + 30 * 86400_000) } });
      await serviceInvoiceTx(tx, updated, `${plan.name} subscription (30 days)`);
      await notifyDealer(p.dealerId!, { type: "PAYMENT_RECEIVED", title: `${plan.name} plan activated`, body: `Your dealership is now on the ${plan.name} plan.`, link: "/dashboard/settings" }, tx);
      break;
    }
    case "FEATURED_LISTING": {
      const days = await getSetting("featured.durationDays", tx);
      const until = new Date(Date.now() + days * 86400_000);
      await tx.featureListing.create({ data: { vehicleId: p.targetId!, dealerId: p.dealerId!, startAt: new Date(), endAt: until, amount: p.amount, paymentId: p.id, active: true } });
      await tx.vehicle.update({ where: { id: p.targetId! }, data: { featuredUntil: until } });
      await serviceInvoiceTx(tx, updated, `Featured listing (${days} days)`);
      await notifyDealer(p.dealerId!, { type: "PAYMENT_RECEIVED", title: "Listing featured", body: `Your vehicle is featured for ${days} days.`, link: "/dashboard/vehicles" }, tx);
      break;
    }
    case "LISTING_FEE":
    case "AUCTION_FEE":
      await serviceInvoiceTx(tx, updated, p.purpose === "LISTING_FEE" ? "Vehicle listing fee" : "Auction fee");
      await notifyDealer(p.dealerId!, { type: "PAYMENT_RECEIVED", title: "Fee paid", body: `${formatINR(p.amount)} received. Thank you.`, link: "/dashboard/payments" }, tx);
      break;
  }
  return updated;
}

async function serviceInvoiceTx(tx: Tx, p: Payment, description: string) {
  const gstBps = await getSetting("gst.rateBps", tx);
  const subtotal = Math.round((p.amount * 10000) / (10000 + gstBps));
  const dealer = p.dealerId ? await tx.dealer.findUnique({ where: { id: p.dealerId } }) : null;
  await tx.invoice.create({
    data: {
      number: invoiceNumber("ABX-SV"),
      type: "SERVICE_INVOICE",
      paymentId: p.id,
      dealerId: p.dealerId,
      billToName: dealer?.name ?? "Customer",
      billToGstin: dealer?.gstin,
      lines: [{ description, amount: subtotal, gst: p.amount - subtotal }] as Prisma.InputJsonValue,
      subtotal,
      gst: p.amount - subtotal,
      total: p.amount,
    },
  });
}

async function applyPaymentFailure(payment: Payment, reason: string) {
  if (payment.status === "PAID") return;
  await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: reason.slice(0, 300) } });
  await audit({ userId: payment.userId, action: "payment.failed", entityType: "Payment", entityId: payment.id, after: { reason } });
  await notify(payment.userId, { type: "PAYMENT_FAILED", title: "Payment failed", body: `Payment ${payment.reference} of ${formatINR(payment.amount)} failed: ${reason}. You can retry.`, link: payment.orderId ? `/checkout/${payment.orderId}` : "/dashboard/payments" });
  await flagFailedPayments(payment.userId).catch(() => {});
}

/** Processes a verified gateway event exactly once. */
async function processEvent(gatewayName: string, ev: GatewayEvent) {
  try {
    await prisma.paymentEvent.create({ data: { gateway: gatewayName, eventId: ev.eventId, type: ev.type, payload: ev.raw as Prisma.InputJsonValue, verified: true } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { duplicate: true };
    throw e;
  }
  const payment =
    (ev.gatewayOrderId ? await prisma.payment.findFirst({ where: { gateway: gatewayName, gatewayOrderId: ev.gatewayOrderId } }) : null) ??
    (ev.gatewayPaymentId ? await prisma.payment.findFirst({ where: { gateway: gatewayName, gatewayPaymentId: ev.gatewayPaymentId } }) : null);
  if (!payment) return { ignored: true };
  await prisma.paymentEvent.updateMany({ where: { gateway: gatewayName, eventId: ev.eventId }, data: { paymentId: payment.id } });

  if (ev.type === "payment.captured") {
    await prisma.$transaction((tx) => applyPaymentSuccessTx(tx, payment, ev.gatewayPaymentId ?? payment.gatewayOrderId ?? "", ev.amount), { timeout: 20000 });
  } else if (ev.type === "payment.failed") {
    await applyPaymentFailure(payment, ev.failureReason ?? "Declined by bank");
  } else if (ev.type === "refund.processed" && ev.gatewayRefundId) {
    await prisma.refund.updateMany({ where: { gatewayRefundId: ev.gatewayRefundId }, data: { status: "PROCESSED", processedAt: new Date() } });
  }
  return { processed: true };
}

export async function handleWebhook(gatewayName: string, rawBody: string, headers: Headers) {
  const gateway = getGateway(gatewayName);
  let ev: GatewayEvent;
  try {
    ev = await gateway.verifyWebhook(rawBody, headers);
  } catch (e) {
    await audit({ action: "payment.webhook_rejected", entityType: "Gateway", entityId: gatewayName, after: { reason: e instanceof Error ? e.message : "invalid" } });
    if (e instanceof GatewaySignatureError) throw new AppError("FORBIDDEN", "Invalid signature.");
    throw e;
  }
  return processEvent(gateway.name, ev);
}

/** Browser callback (e.g. Razorpay handler) — verified with the gateway's signature scheme. */
export async function handleCallback(paymentId: string, actor: Actor, payload: Record<string, string>) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.userId !== actor.userId) throw notFound("Payment not found.");
  const gateway = getGateway(payment.gateway);
  if (!gateway.verifyCallback) throw conflict("This gateway confirms payments via webhook.");
  let ev: GatewayEvent;
  try {
    ev = await gateway.verifyCallback(payload);
  } catch {
    throw new AppError("PAYMENT_FAILED", "Payment verification failed.");
  }
  if (ev.gatewayOrderId !== payment.gatewayOrderId) throw new AppError("PAYMENT_FAILED", "Payment verification failed.");
  return processEvent(gateway.name, ev);
}

// ───────────────────────── Refunds ─────────────────────────

export async function refundPayment(input: { paymentId: string; amount: number; reason: string; actor: Actor; disputeId?: string; ip?: string | null }) {
  if (!can(input.actor, "payments.refund")) throw forbidden();
  const payment = await prisma.payment.findUnique({ where: { id: input.paymentId }, include: { order: true } });
  if (!payment) throw notFound("Payment not found.");
  if (payment.status !== "PAID" && payment.status !== "PARTIALLY_REFUNDED") throw conflict("Only paid payments can be refunded.");
  const refundable = payment.amount - payment.refundedAmount;
  if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > refundable)
    throw new AppError("VALIDATION", `Refund amount must be between ₹1 and ${formatINR(refundable)}.`);

  const gateway = getGateway(payment.gateway);
  const refundRef = `RF-${shortCode(8).toUpperCase()}`;
  const res = await gateway.refund({ gatewayPaymentId: payment.gatewayPaymentId ?? "", amount: input.amount, reason: input.reason, refundRef });

  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.create({
      data: {
        paymentId: payment.id,
        amount: input.amount,
        reason: input.reason,
        status: res.status,
        gatewayRefundId: res.gatewayRefundId,
        initiatedById: input.actor.userId,
        disputeId: input.disputeId,
        processedAt: res.status === "PROCESSED" ? new Date() : null,
      },
    });
    const refundedAmount = payment.refundedAmount + input.amount;
    const status = refundedAmount >= payment.amount ? "REFUNDED" : "PARTIALLY_REFUNDED";
    await tx.payment.update({ where: { id: payment.id }, data: { refundedAmount, status } });
    if (payment.orderId) await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: status } });
    await audit({ userId: input.actor.userId, action: "payment.refund", entityType: "Payment", entityId: payment.id, after: { amount: input.amount, reason: input.reason, refundId: refund.id }, ip: input.ip }, tx);
    await notify(payment.userId, { type: "REFUND", title: "Refund initiated", body: `${formatINR(input.amount)} is being refunded for ${payment.reference}. Reason: ${input.reason}`, link: payment.orderId ? `/dashboard/orders/${payment.orderId}` : "/dashboard/payments" }, tx);
    return refund;
  });
}

/** Listing-fee charge created when a dealer submits a listing (if the fee engine yields > 0). */
export async function createListingChargeTx(tx: Tx, dealerId: string, userId: string, vehicleId: string, price: number, purpose: "LISTING_FEE" | "AUCTION_FEE") {
  const q = await quoteServiceFee(purpose === "LISTING_FEE" ? "LISTING" : "AUCTION", dealerId, price, tx);
  if (q.total <= 0) return null;
  const existing = await tx.payment.findFirst({ where: { dealerId, purpose, targetId: vehicleId, status: { in: ["PENDING", "PAID", "PROCESSING"] } } });
  if (existing) return existing;
  return tx.payment.create({
    data: { reference: paymentReference(), purpose, userId, dealerId, amount: q.total, gateway: "pending", targetId: vehicleId, meta: { lines: q.lines } as unknown as Prisma.InputJsonValue },
  });
}
