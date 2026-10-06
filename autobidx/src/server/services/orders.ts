import { prisma, type Tx } from "@/lib/db";
import { AppError, conflict, forbidden, notFound } from "@/lib/errors";
import { invoiceNumber, orderNumber } from "@/lib/ids";
import { formatINR } from "@/lib/format";
import type { OrderSource, OrderStatus, Prisma, Vehicle } from "@prisma/client";
import type { Actor } from "../auth/rbac";
import { can } from "../auth/rbac";
import { audit } from "../audit";
import { notify, notifyDealer } from "../notifications/notify";
import { getSetting } from "../settings";
import { quoteTransaction, type FeeBreakdown } from "./fees";
import { registerJob } from "../jobs/queue";

export const ORDER_FLOW: OrderStatus[] = [
  "PAYMENT_PENDING",
  "PAYMENT_RECEIVED",
  "SELLER_CONFIRMED",
  "DOCUMENTS_PENDING",
  "VEHICLE_READY",
  "IN_DELIVERY",
  "COMPLETED",
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PAYMENT_PENDING: "Payment Pending",
  PAYMENT_RECEIVED: "Payment Received",
  SELLER_CONFIRMED: "Seller Confirmed",
  DOCUMENTS_PENDING: "Documents Pending",
  VEHICLE_READY: "Vehicle Ready",
  IN_DELIVERY: "Pickup / Delivery",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
};

type CreateOrderInput = {
  vehicle: Pick<Vehicle, "id" | "dealerId" | "title" | "code">;
  source: OrderSource;
  buyerId: string;
  buyerDealerId: string | null;
  price: number;
  auctionId?: string;
  offerId?: string;
  actorId?: string | null;
  ip?: string | null;
};

/**
 * Creates an order inside the caller's transaction. The partial-unique `activeVehicleKey`
 * guarantees a vehicle can never have two live orders (double-sale protection at DB level).
 */
export async function createOrderTx(tx: Tx, input: CreateOrderInput) {
  if (input.buyerDealerId && input.buyerDealerId === input.vehicle.dealerId) throw forbidden("You cannot buy your own vehicle.");
  const existing = await tx.order.findUnique({ where: { activeVehicleKey: input.vehicle.id } });
  if (existing) throw new AppError("ALREADY_SOLD", "This vehicle has already been sold.");

  const fees: FeeBreakdown = await quoteTransaction(input.price, { buyerDealerId: input.buyerDealerId, sellerDealerId: input.vehicle.dealerId }, tx);
  const windowHours = await getSetting("orders.paymentWindowHours", tx);
  const items: Prisma.OrderItemCreateWithoutOrderInput[] = [
    { code: "VEHICLE", description: `Vehicle price — ${input.vehicle.title}`, payer: "BUYER", amount: fees.price, sortOrder: 0 },
    ...fees.lines.map((l, i) => ({ code: l.code, description: l.name, payer: l.payer, amount: l.amount, sortOrder: 10 + i })),
  ];
  if (fees.buyer.gst) items.push({ code: "GST_BUYER", description: "GST on buyer fees", payer: "BUYER", amount: fees.buyer.gst, sortOrder: 50 });
  if (fees.seller.gst) items.push({ code: "GST_SELLER", description: "GST on seller fees", payer: "SELLER", amount: fees.seller.gst, sortOrder: 51 });

  const order = await tx.order.create({
    data: {
      orderNumber: orderNumber(),
      source: input.source,
      vehicleId: input.vehicle.id,
      auctionId: input.auctionId,
      offerId: input.offerId,
      buyerId: input.buyerId,
      buyerDealerId: input.buyerDealerId,
      sellerDealerId: input.vehicle.dealerId,
      winningBid: input.source === "AUCTION" ? input.price : null,
      vehiclePrice: fees.price,
      buyerFee: fees.buyer.fees,
      sellerFee: fees.seller.fees,
      gstAmount: fees.buyer.gst,
      sellerGstAmount: fees.seller.gst,
      buyerTotal: fees.buyer.total,
      sellerNet: fees.seller.net,
      feeBreakdown: fees as unknown as Prisma.InputJsonValue,
      paymentDueAt: new Date(Date.now() + windowHours * 3600_000),
      activeVehicleKey: input.vehicle.id,
      items: { create: items },
      history: { create: { from: null, to: "PAYMENT_PENDING", actorId: input.actorId ?? null, note: sourceNote(input.source) } },
      documents: {
        create: [
          { type: "INVOICE", generated: true, title: "Buyer tax invoice" },
          { type: "SALE_AGREEMENT", generated: true, title: "Vehicle sale agreement" },
        ],
      },
    },
  });

  const [buyer, sellerDealer, buyerDealer] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: input.buyerId }, select: { name: true } }),
    tx.dealer.findUniqueOrThrow({ where: { id: input.vehicle.dealerId }, select: { name: true, gstin: true } }),
    input.buyerDealerId ? tx.dealer.findUnique({ where: { id: input.buyerDealerId }, select: { name: true, gstin: true } }) : null,
  ]);

  const buyerLines = fees.lines.filter((l) => l.payer === "BUYER");
  await tx.invoice.create({
    data: {
      number: invoiceNumber("ALC-B"),
      type: "BUYER_TAX_INVOICE",
      orderId: order.id,
      dealerId: input.buyerDealerId,
      billToName: buyerDealer?.name ?? buyer.name,
      billToGstin: buyerDealer?.gstin ?? null,
      lines: buyerLines.map((l) => ({ description: l.name, amount: l.amount, gst: l.gst })) as Prisma.InputJsonValue,
      subtotal: fees.buyer.fees,
      gst: fees.buyer.gst,
      total: fees.buyer.fees + fees.buyer.gst,
    },
  });
  const sellerLines = fees.lines.filter((l) => l.payer === "SELLER");
  await tx.invoice.create({
    data: {
      number: invoiceNumber("ALC-S"),
      type: "SELLER_FEE_INVOICE",
      orderId: order.id,
      dealerId: input.vehicle.dealerId,
      billToName: sellerDealer.name,
      billToGstin: sellerDealer.gstin,
      lines: sellerLines.map((l) => ({ description: l.name, amount: l.amount, gst: l.gst })) as Prisma.InputJsonValue,
      subtotal: fees.seller.fees,
      gst: fees.seller.gst,
      total: fees.seller.fees + fees.seller.gst,
    },
  });

  await tx.vehicle.update({ where: { id: input.vehicle.id }, data: { status: "RESERVED" } });
  await audit({ userId: input.actorId ?? null, action: "order.create", entityType: "Order", entityId: order.id, after: { orderNumber: order.orderNumber, source: input.source, price: fees.price, buyerTotal: fees.buyer.total }, ip: input.ip }, tx);

  const link = `/dashboard/orders/${order.id}`;
  await notify(input.buyerId, {
    type: "PAYMENT_PENDING",
    title: input.source === "AUCTION" ? "You won the auction! Complete payment" : "Order created — complete payment",
    body: `${input.vehicle.title}: pay ${formatINR(fees.buyer.total)} within ${windowHours} hours to secure the vehicle.`,
    link,
  }, tx);
  await notifyDealer(input.vehicle.dealerId, {
    type: "AUCTION_SOLD",
    title: "Your vehicle has a buyer",
    body: `${input.vehicle.title} sold for ${formatINR(fees.price)} (${sourceNote(input.source)}). Net receivable ${formatINR(fees.seller.net)} after payment.`,
    link,
  }, tx);
  return order;
}

function sourceNote(source: OrderSource) {
  return source === "AUCTION" ? "Auction won" : source === "BUY_NOW" ? "Buy Now purchase" : "Offer accepted";
}

export type OrderRole = "buyer" | "seller" | "admin";

export function orderRoleFor(actor: Actor, order: { buyerId: string; buyerDealerId: string | null; sellerDealerId: string }): OrderRole | null {
  if (can(actor, "orders.manage")) return "admin";
  if (order.buyerId === actor.userId || (actor.dealer && order.buyerDealerId === actor.dealer.id)) return "buyer";
  if (actor.dealer && order.sellerDealerId === actor.dealer.id) return "seller";
  return null;
}

export async function getOrderForActor(orderId: string, actor: Actor) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      vehicle: { include: { make: true, model: true, images: { orderBy: { sortOrder: "asc" }, take: 1 } } },
      buyer: { select: { id: true, name: true, email: true, phone: true } },
      buyerDealer: { select: { id: true, name: true, slug: true, gstin: true } },
      sellerDealer: { select: { id: true, name: true, slug: true, gstin: true, addressLine: true, pincode: true } },
      items: { orderBy: { sortOrder: "asc" } },
      history: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "desc" }, include: { refunds: true } },
      invoices: true,
      documents: { orderBy: { createdAt: "asc" } },
      disputes: { orderBy: { createdAt: "desc" } },
      reviews: true,
    },
  });
  if (!order) throw notFound("Order not found.");
  const role = orderRoleFor(actor, order);
  if (!role) throw notFound("Order not found.");
  return { order, role };
}

// Who may move an order into each status.
const TRANSITIONS: Partial<Record<OrderStatus, { to: OrderStatus; by: OrderRole[] }[]>> = {
  PAYMENT_RECEIVED: [{ to: "SELLER_CONFIRMED", by: ["seller", "admin"] }],
  SELLER_CONFIRMED: [{ to: "DOCUMENTS_PENDING", by: ["seller", "admin"] }],
  DOCUMENTS_PENDING: [{ to: "VEHICLE_READY", by: ["seller", "admin"] }],
  VEHICLE_READY: [{ to: "IN_DELIVERY", by: ["seller", "admin"] }],
  IN_DELIVERY: [{ to: "COMPLETED", by: ["buyer", "admin"] }],
};

export function allowedTransitions(status: OrderStatus, role: OrderRole): OrderStatus[] {
  const list = (TRANSITIONS[status] ?? []).filter((t) => t.by.includes(role)).map((t) => t.to);
  if (status === "PAYMENT_PENDING" && (role === "buyer" || role === "admin" || role === "seller")) list.push("CANCELLED");
  if (role === "admin" && !["COMPLETED", "CANCELLED", "PAYMENT_PENDING"].includes(status)) list.push("CANCELLED");
  return list;
}

export async function transitionOrder(
  orderId: string,
  actor: Actor,
  to: OrderStatus,
  data: { note?: string; deliveryMode?: "PICKUP" | "DELIVERY"; deliveryDate?: Date; deliveryNotes?: string; ip?: string | null } = {},
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { vehicle: true, documents: true } });
    if (!order) throw notFound("Order not found.");
    const role = orderRoleFor(actor, order);
    if (!role) throw notFound("Order not found.");
    if (!allowedTransitions(order.status, role).includes(to))
      throw conflict(`This order cannot move from ${ORDER_STATUS_LABEL[order.status]} to ${ORDER_STATUS_LABEL[to]}.`);

    const update: Prisma.OrderUpdateInput = { status: to };
    if (to === "VEHICLE_READY") {
      const hasRc = order.documents.some((d) => d.type === "RC");
      if (!hasRc) throw new AppError("VALIDATION", "Upload the RC copy before marking the vehicle ready.");
    }
    if (to === "IN_DELIVERY") {
      if (!data.deliveryMode) throw new AppError("VALIDATION", "Choose pickup or delivery.");
      update.deliveryMode = data.deliveryMode;
      update.deliveryDate = data.deliveryDate ?? new Date();
      update.deliveryNotes = data.deliveryNotes;
      update.deliveryStatus = data.deliveryMode === "DELIVERY" ? "IN_TRANSIT" : "SCHEDULED";
      await tx.document.create({ data: { orderId, type: "DELIVERY_CHALLAN", generated: true, title: "Delivery challan" } });
    }
    if (to === "COMPLETED") {
      update.deliveryStatus = "DELIVERED";
      update.completedAt = new Date();
      update.payoutStatus = "PENDING";
      await tx.dealer.update({ where: { id: order.sellerDealerId }, data: { soldCount: { increment: 1 } } });
      if (order.buyerDealerId) await tx.dealer.update({ where: { id: order.buyerDealerId }, data: { boughtCount: { increment: 1 } } });
    }
    if (to === "CANCELLED") {
      if (order.paymentStatus === "PAID" && role === "admin") update.payoutStatus = "NOT_DUE";
      update.cancelReason = data.note ?? "Cancelled";
      update.activeVehicleKey = null; // release the vehicle
      await releaseVehicleTx(tx, order.vehicleId);
    }
    const updated = await tx.order.update({ where: { id: orderId }, data: update });
    await tx.orderStatusHistory.create({ data: { orderId, from: order.status, to, actorId: actor.userId, note: data.note } });
    await audit({ userId: actor.userId, action: `order.${to.toLowerCase()}`, entityType: "Order", entityId: orderId, before: { status: order.status }, after: { status: to, note: data.note }, ip: data.ip }, tx);

    const msg = {
      type: "ORDER_STATUS" as const,
      title: `Order ${order.orderNumber}: ${ORDER_STATUS_LABEL[to]}`,
      body: `${order.vehicle.title} is now "${ORDER_STATUS_LABEL[to]}".`,
      link: `/dashboard/orders/${orderId}`,
    };
    await notify(order.buyerId, msg, tx);
    await notifyDealer(order.sellerDealerId, msg, tx);
    return updated;
  });
}

/** Returns a vehicle to the market after a failed/cancelled sale. */
export async function releaseVehicleTx(tx: Tx, vehicleId: string) {
  await tx.vehicle.update({ where: { id: vehicleId }, data: { status: "PUBLISHED", soldAt: null } });
}

/** Called by the payment service after a server-verified successful payment. */
export async function markOrderPaidTx(tx: Tx, orderId: string, paymentId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { vehicle: true } });
  if (order.status !== "PAYMENT_PENDING") {
    // Payment arrived after cancellation — flag for refund review rather than silently re-opening.
    await audit({ action: "order.late_payment", entityType: "Order", entityId: orderId, after: { paymentId, status: order.status } }, tx);
    return order;
  }
  await tx.order.update({
    where: { id: orderId },
    data: { status: "PAYMENT_RECEIVED", paymentStatus: "PAID", payoutStatus: "ON_HOLD" },
  });
  await tx.orderStatusHistory.create({ data: { orderId, from: order.status, to: "PAYMENT_RECEIVED", note: "Payment verified by gateway" } });
  await tx.document.create({ data: { orderId, type: "PAYMENT_RECEIPT", generated: true, title: "Payment receipt" } });
  await tx.vehicle.update({ where: { id: order.vehicleId }, data: { status: "SOLD", soldAt: new Date() } });
  const msg = {
    type: "PAYMENT_RECEIVED" as const,
    title: "Payment received",
    body: `Payment of ${formatINR(order.buyerTotal)} for ${order.vehicle.title} (${order.orderNumber}) has been verified.`,
    link: `/dashboard/orders/${orderId}`,
  };
  await notify(order.buyerId, msg, tx);
  await notifyDealer(order.sellerDealerId, { ...msg, body: `${msg.body} Please confirm the sale and prepare documents.` }, tx);
  return order;
}

/** Job: cancel orders whose payment window lapsed and put the vehicle back on the market. */
export async function expireUnpaidOrders() {
  const due = await prisma.order.findMany({ where: { status: "PAYMENT_PENDING", paymentDueAt: { lt: new Date() } }, select: { id: true }, take: 100 });
  for (const { id } of due) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
      const o = await tx.order.findUnique({ where: { id }, include: { vehicle: true, payments: true } });
      if (!o || o.status !== "PAYMENT_PENDING") return;
      if (o.payments.some((p) => p.status === "PROCESSING")) return; // bank transfer awaiting reconciliation
      await tx.order.update({ where: { id }, data: { status: "CANCELLED", cancelReason: "Payment window expired", activeVehicleKey: null } });
      await tx.orderStatusHistory.create({ data: { orderId: id, from: o.status, to: "CANCELLED", note: "Payment window expired" } });
      await releaseVehicleTx(tx, o.vehicleId);
      await audit({ action: "order.expired", entityType: "Order", entityId: id }, tx);
      const msg = { type: "ORDER_STATUS" as const, title: `Order ${o.orderNumber} cancelled`, body: `Payment for ${o.vehicle.title} was not received in time.`, link: `/dashboard/orders/${id}` };
      await notify(o.buyerId, msg, tx);
      await notifyDealer(o.sellerDealerId, { ...msg, body: `${msg.body} The vehicle is back on the marketplace.` }, tx);
    });
  }
  return due.length;
}

registerJob("orders.expire", async () => {
  await expireUnpaidOrders();
});

export async function releasePayout(orderId: string, actor: Actor, ip?: string | null) {
  if (!can(actor, "payments.manage")) throw forbidden();
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound();
  if (order.payoutStatus !== "PENDING") throw conflict("Payout is not due for release.");
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { payoutStatus: "RELEASED" } });
    await audit({ userId: actor.userId, action: "payout.release", entityType: "Order", entityId: orderId, after: { amount: order.sellerNet }, ip }, tx);
    await notifyDealer(order.sellerDealerId, { type: "PAYMENT_RECEIVED", title: "Payout released", body: `${formatINR(order.sellerNet)} for order ${order.orderNumber} has been released to your bank account.`, link: `/dashboard/orders/${orderId}` }, tx);
  });
}
