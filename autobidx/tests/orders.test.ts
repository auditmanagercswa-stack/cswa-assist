import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { buyNow } from "@/server/services/sales";
import { expireUnpaidOrders, markOrderPaidTx, transitionOrder, allowedTransitions } from "@/server/services/orders";
import { uploadOrderDocument } from "@/server/services/documents";
import { createReview } from "@/server/services/reviews";
import { adminUpdateDispute, raiseDispute } from "@/server/services/disputes";
import { expectAppError, makeAdmin, makeDealer, makeVehicle, seedWorld, type World } from "./helpers";

let w: World;
beforeEach(async () => {
  w = await seedWorld();
});

async function paidOrder() {
  const seller = await makeDealer(w);
  const buyer = await makeDealer(w);
  const v = await makeVehicle(w, seller.dealer.id, { buyNowEnabled: true, buyNowPrice: 600000 });
  const order = await buyNow({ vehicleId: v.id, actor: buyer.actor });
  await prisma.$transaction((tx) => markOrderPaidTx(tx, order.id, "manual"));
  return { seller, buyer, v, order };
}

async function rcFile(ownerId: string) {
  return prisma.storedFile.create({ data: { ownerId, key: `order-doc/test/${Math.random()}.pdf`, mime: "application/pdf", size: 10, sha256: sha256("x"), purpose: "order-doc" } });
}

describe("order lifecycle", () => {
  it("walks Payment Received → Seller Confirmation → Documents → Ready → Delivery → Completed with role checks", async () => {
    const { seller, buyer, order, v } = await paidOrder();
    await expectAppError(transitionOrder(order.id, buyer.actor, "SELLER_CONFIRMED"), "CONFLICT");
    await transitionOrder(order.id, seller.actor, "SELLER_CONFIRMED");
    await transitionOrder(order.id, seller.actor, "DOCUMENTS_PENDING");
    await expectAppError(transitionOrder(order.id, seller.actor, "VEHICLE_READY"), "VALIDATION"); // RC required
    const f = await rcFile(seller.user.id);
    await uploadOrderDocument(seller.actor, order.id, { type: "RC", fileId: f.id });
    await transitionOrder(order.id, seller.actor, "VEHICLE_READY");
    await expectAppError(transitionOrder(order.id, seller.actor, "IN_DELIVERY"), "VALIDATION"); // mode required
    await transitionOrder(order.id, seller.actor, "IN_DELIVERY", { deliveryMode: "PICKUP" });
    await expectAppError(transitionOrder(order.id, seller.actor, "COMPLETED"), "CONFLICT"); // buyer confirms
    await transitionOrder(order.id, buyer.actor, "COMPLETED");
    const done = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(done.status).toBe("COMPLETED");
    expect(done.deliveryStatus).toBe("DELIVERED");
    expect(done.payoutStatus).toBe("PENDING");
    expect((await prisma.dealer.findUniqueOrThrow({ where: { id: seller.dealer.id } })).soldCount).toBe(1);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id } })).toBe(7);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("SOLD");
  });

  it("unrelated dealers can't see or move the order", async () => {
    const { order } = await paidOrder();
    const stranger = await makeDealer(w);
    await expectAppError(transitionOrder(order.id, stranger.actor, "SELLER_CONFIRMED"), "NOT_FOUND");
  });

  it("buyer can cancel before payment; unpaid orders expire and release the vehicle", async () => {
    const seller = await makeDealer(w);
    const buyer = await makeDealer(w);
    const v = await makeVehicle(w, seller.dealer.id, { buyNowEnabled: true, buyNowPrice: 600000 });
    const order = await buyNow({ vehicleId: v.id, actor: buyer.actor });
    expect(allowedTransitions("PAYMENT_PENDING", "buyer")).toContain("CANCELLED");
    await prisma.order.update({ where: { id: order.id }, data: { paymentDueAt: new Date(Date.now() - 1000) } });
    expect(await expireUnpaidOrders()).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CANCELLED");
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("PUBLISHED");
    // the vehicle can be bought again (activeVehicleKey released)
    const again = await buyNow({ vehicleId: v.id, actor: buyer.actor });
    expect(again.id).not.toBe(order.id);
  });

  it("reviews only after completion, once per direction, updating dealer rating", async () => {
    const { seller, buyer, order } = await paidOrder();
    await expectAppError(createReview(buyer.actor, { orderId: order.id, rating: 5 }), "CONFLICT");
    await prisma.order.update({ where: { id: order.id }, data: { status: "COMPLETED" } });
    await createReview(buyer.actor, { orderId: order.id, rating: 4, comment: "Good" });
    await expectAppError(createReview(buyer.actor, { orderId: order.id, rating: 5 }), "CONFLICT");
    await createReview(seller.actor, { orderId: order.id, rating: 5 });
    const d = await prisma.dealer.findUniqueOrThrow({ where: { id: seller.dealer.id } });
    expect(d.ratingAvg).toBe(4);
    expect(d.ratingCount).toBe(1);
    await expectAppError(createReview(buyer.actor, { orderId: order.id, rating: 9 }), "VALIDATION");
  });

  it("disputes freeze the order and resolution with refund restores/cancels it", async () => {
    const { buyer, order } = await paidOrder();
    const pay = await prisma.payment.create({ data: { reference: "PAY-T1", purpose: "ORDER", orderId: order.id, userId: buyer.user.id, amount: order.buyerTotal, gateway: "mock", gatewayPaymentId: "gp", status: "PAID" } });
    const d = await raiseDispute(buyer.actor, { orderId: order.id, category: "CONDITION_MISMATCH", subject: "Odometer mismatch", description: "Reading differs from the listing by a lot." });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("DISPUTED");
    await expectAppError(raiseDispute(buyer.actor, { orderId: order.id, category: "DELIVERY", subject: "Another", description: "Second dispute should be blocked." }), "CONFLICT");
    const admin = await makeAdmin();
    await adminUpdateDispute(admin.actor, d.id, { status: "RESOLVED", resolution: "Partial refund agreed", refundAmount: 20000, cancelOrder: false });
    const after = await prisma.dispute.findUniqueOrThrow({ where: { id: d.id } });
    expect(after.status).toBe("REFUNDED");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAYMENT_RECEIVED");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pay.id } })).refundedAmount).toBe(20000);
    expect(await prisma.auditLog.count({ where: { entityId: d.id } })).toBeGreaterThanOrEqual(2);
  });
});
