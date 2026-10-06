import { prisma } from "@/lib/db";
import { AppError, conflict, forbidden, notFound } from "@/lib/errors";
import { disputeNumber } from "@/lib/ids";
import type { DisputeCategory, DisputeStatus, Party } from "@prisma/client";
import type { Actor } from "../auth/rbac";
import { can } from "../auth/rbac";
import { audit } from "../audit";
import { notify, notifyAdmins, notifyDealer } from "../notifications/notify";
import { orderRoleFor } from "./orders";
import { refundPayment } from "./payments";

export const BUYER_CATEGORIES: DisputeCategory[] = ["CONDITION_MISMATCH", "DOCUMENTATION", "PAYMENT", "DELIVERY", "FRAUD", "OTHER"];
export const SELLER_CATEGORIES: DisputeCategory[] = ["PAYMENT", "BUYER_CANCELLATION", "DOCUMENTATION", "OTHER"];

export async function raiseDispute(actor: Actor, input: { orderId: string; category: DisputeCategory; subject: string; description: string }) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw notFound("Order not found.");
  const role = orderRoleFor(actor, order);
  if (role !== "buyer" && role !== "seller") throw notFound("Order not found.");
  const party: Party = role === "buyer" ? "BUYER" : "SELLER";
  const allowed = party === "BUYER" ? BUYER_CATEGORIES : SELLER_CATEGORIES;
  if (!allowed.includes(input.category)) throw new AppError("VALIDATION", "Choose a valid dispute category.");
  if (order.status === "CANCELLED") throw conflict("Disputes can't be raised on cancelled orders.");
  const open = await prisma.dispute.findFirst({ where: { orderId: order.id, status: { in: ["OPEN", "INVESTIGATING", "AWAITING_DOCUMENTS"] } } });
  if (open) throw conflict("There's already an open dispute on this order.");

  return prisma.$transaction(async (tx) => {
    const d = await tx.dispute.create({
      data: {
        number: disputeNumber(),
        orderId: order.id,
        raisedById: actor.userId,
        raisedByParty: party,
        category: input.category,
        subject: input.subject,
        description: input.description,
        previousOrderStatus: order.status,
        messages: { create: { authorId: actor.userId, body: input.description } },
      },
    });
    // Freeze the order workflow and hold any payout while the dispute is open.
    if (order.status !== "COMPLETED") await tx.order.update({ where: { id: order.id }, data: { status: "DISPUTED", payoutStatus: order.payoutStatus === "NOT_DUE" ? "NOT_DUE" : "ON_HOLD" } });
    else await tx.order.update({ where: { id: order.id }, data: { payoutStatus: order.payoutStatus === "RELEASED" ? "RELEASED" : "ON_HOLD" } });
    await tx.orderStatusHistory.create({ data: { orderId: order.id, from: order.status, to: order.status === "COMPLETED" ? "COMPLETED" : "DISPUTED", actorId: actor.userId, note: `Dispute ${d.number} raised` } });
    await audit({ userId: actor.userId, action: "dispute.raise", entityType: "Dispute", entityId: d.id, after: { category: input.category, orderId: order.id } }, tx);
    const link = `/dashboard/orders/${order.id}`;
    if (party === "BUYER") await notifyDealer(order.sellerDealerId, { type: "DISPUTE", title: "A dispute was raised", body: `${d.number}: ${input.subject}`, link }, tx);
    else await notify(order.buyerId, { type: "DISPUTE", title: "A dispute was raised", body: `${d.number}: ${input.subject}`, link }, tx);
    await notifyAdmins({ type: "DISPUTE", title: "New dispute", body: `${d.number} (${input.category.replace(/_/g, " ").toLowerCase()})`, link: `/admin/disputes/${d.id}` }, tx);
    return d;
  });
}

export async function getDisputeForActor(disputeId: string, actor: Actor) {
  const d = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      order: { include: { vehicle: { select: { title: true, code: true } }, payments: { where: { status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } } } } },
      raisedBy: { select: { name: true } },
      assignee: { select: { name: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, role: { select: { key: true } } } } } },
    },
  });
  if (!d) throw notFound();
  const admin = can(actor, "disputes.manage");
  if (!admin && !orderRoleFor(actor, d.order)) throw notFound();
  return { ...d, messages: admin ? d.messages : d.messages.filter((m) => !m.internal), isAdmin: admin };
}

export async function postDisputeMessage(actor: Actor, disputeId: string, body: string, opts: { internal?: boolean; requestDocuments?: boolean } = {}) {
  const d = await getDisputeForActor(disputeId, actor);
  if (["RESOLVED", "REFUNDED", "CLOSED"].includes(d.status)) throw conflict("This dispute is closed.");
  if ((opts.internal || opts.requestDocuments) && !d.isAdmin) throw forbidden();
  await prisma.$transaction(async (tx) => {
    await tx.disputeMessage.create({ data: { disputeId, authorId: actor.userId, body, internal: !!opts.internal, kind: opts.requestDocuments ? "DOCUMENT_REQUEST" : "MESSAGE" } });
    if (opts.requestDocuments) await tx.dispute.update({ where: { id: disputeId }, data: { status: "AWAITING_DOCUMENTS" } });
    await audit({ userId: actor.userId, action: opts.requestDocuments ? "dispute.request_documents" : "dispute.message", entityType: "Dispute", entityId: disputeId, after: { internal: !!opts.internal } }, tx);
    if (!opts.internal) {
      const link = d.isAdmin ? `/dashboard/orders/${d.orderId}` : `/admin/disputes/${disputeId}`;
      const msg = { type: "DISPUTE" as const, title: `Update on dispute ${d.number}`, body: body.slice(0, 140), link };
      if (d.isAdmin) {
        await notify(d.order.buyerId, msg, tx);
        await notifyDealer(d.order.sellerDealerId, msg, tx);
      } else await notifyAdmins(msg, tx);
    }
  });
}

export async function adminUpdateDispute(
  actor: Actor,
  disputeId: string,
  input: { status: DisputeStatus; resolution?: string; refundAmount?: number; penaltyAmount?: number; penaltyParty?: Party; restoreOrder?: boolean; cancelOrder?: boolean },
) {
  if (!can(actor, "disputes.manage")) throw forbidden();
  const d = await prisma.dispute.findUnique({ where: { id: disputeId }, include: { order: { include: { payments: true } } } });
  if (!d) throw notFound();
  if (["RESOLVED", "REFUNDED", "CLOSED"].includes(d.status) && input.status !== "CLOSED") throw conflict("This dispute is already resolved.");
  const closing = ["RESOLVED", "REFUNDED", "CLOSED"].includes(input.status);
  if (closing && !input.resolution?.trim()) throw new AppError("VALIDATION", "Add a resolution summary.");

  if (input.refundAmount && input.refundAmount > 0) {
    const paid = d.order.payments.find((p) => p.status === "PAID" || p.status === "PARTIALLY_REFUNDED");
    if (!paid) throw conflict("No captured payment to refund on this order.");
    await refundPayment({ paymentId: paid.id, amount: input.refundAmount, reason: `Dispute ${d.number}: ${input.resolution ?? ""}`.slice(0, 200), actor, disputeId });
  }
  await prisma.$transaction(async (tx) => {
    await tx.dispute.update({
      where: { id: disputeId },
      data: {
        status: input.refundAmount ? "REFUNDED" : input.status,
        resolution: input.resolution,
        assigneeId: d.assigneeId ?? actor.userId,
        penaltyAmount: input.penaltyAmount ?? null,
        penaltyParty: input.penaltyParty ?? null,
        resolvedAt: closing ? new Date() : null,
      },
    });
    await tx.disputeMessage.create({ data: { disputeId, authorId: actor.userId, body: `Status changed to ${input.status.replace(/_/g, " ").toLowerCase()}${input.resolution ? ": " + input.resolution : ""}`, kind: "STATUS" } });
    if (closing && d.order.status === "DISPUTED") {
      if (input.cancelOrder) {
        await tx.order.update({ where: { id: d.orderId }, data: { status: "CANCELLED", cancelReason: `Dispute ${d.number}`, activeVehicleKey: null, payoutStatus: "NOT_DUE" } });
        await tx.vehicle.update({ where: { id: d.order.vehicleId }, data: { status: "SUSPENDED", statusReason: `Dispute ${d.number}` } });
        await tx.orderStatusHistory.create({ data: { orderId: d.orderId, from: "DISPUTED", to: "CANCELLED", actorId: actor.userId, note: `Dispute ${d.number} resolved` } });
      } else if (input.restoreOrder !== false && d.previousOrderStatus) {
        await tx.order.update({ where: { id: d.orderId }, data: { status: d.previousOrderStatus, payoutStatus: d.order.payoutStatus === "ON_HOLD" && d.previousOrderStatus === "COMPLETED" ? "PENDING" : d.order.payoutStatus } });
        await tx.orderStatusHistory.create({ data: { orderId: d.orderId, from: "DISPUTED", to: d.previousOrderStatus, actorId: actor.userId, note: `Dispute ${d.number} resolved` } });
      }
    }
    await audit({ userId: actor.userId, action: "dispute.update", entityType: "Dispute", entityId: disputeId, before: { status: d.status }, after: input }, tx);
    const msg = { type: "DISPUTE" as const, title: `Dispute ${d.number}: ${input.status.replace(/_/g, " ").toLowerCase()}`, body: input.resolution ?? "Your dispute was updated.", link: `/dashboard/orders/${d.orderId}` };
    await notify(d.order.buyerId, msg, tx);
    await notifyDealer(d.order.sellerDealerId, msg, tx);
  });
}
