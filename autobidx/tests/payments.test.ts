import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { buyNow } from "@/server/services/sales";
import { confirmBankTransfer, handleWebhook, initiateOrderPayment, initiateServicePayment, refundPayment, submitBankTransferUtr } from "@/server/services/payments";
import { signMockWebhook } from "@/server/payments/mock";
import { expectAppError, makeAdmin, makeDealer, makeVehicle, seedWorld, type World } from "./helpers";

let w: World;
beforeEach(async () => {
  w = await seedWorld();
});

async function orderFixture() {
  const seller = await makeDealer(w);
  const buyer = await makeDealer(w);
  const v = await makeVehicle(w, seller.dealer.id, { buyNowEnabled: true, buyNowPrice: 600000 });
  const order = await buyNow({ vehicleId: v.id, actor: buyer.actor });
  return { seller, buyer, v, order };
}

function webhook(body: Record<string, unknown>) {
  const { raw, signature } = signMockWebhook(body);
  return handleWebhook("mock", raw, new Headers({ "x-mock-signature": signature }));
}

describe("payments", () => {
  it("derives the amount on the server and marks PAID only from a signed webhook", async () => {
    const { buyer, order, v } = await orderFixture();
    const p = await initiateOrderPayment({ orderId: order.id, actor: buyer.actor, method: "UPI" });
    expect(p.amount).toBe(604720);
    expect(p.redirectUrl).toBe(`/pay/mock/${p.paymentId}`);
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: p.paymentId } });
    expect(pay.status).toBe("PENDING");

    // forged webhook is rejected
    await expectAppError(handleWebhook("mock", JSON.stringify({ id: "evt1", event: "payment.captured", orderId: pay.gatewayOrderId, amount: 604720 }), new Headers({ "x-mock-signature": "deadbeef" })), "FORBIDDEN");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p.paymentId } })).status).toBe("PENDING");

    await webhook({ id: "evt2", event: "payment.captured", orderId: pay.gatewayOrderId, paymentId: "mock_pay_1", amount: 604720 });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p.paymentId } })).status).toBe("PAID");
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("PAYMENT_RECEIVED");
    expect(o.paymentStatus).toBe("PAID");
    expect(o.payoutStatus).toBe("ON_HOLD");
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("SOLD");
    expect(await prisma.document.count({ where: { orderId: order.id, type: "PAYMENT_RECEIPT" } })).toBe(1);

    // duplicate event is idempotent
    const dup = await webhook({ id: "evt2", event: "payment.captured", orderId: pay.gatewayOrderId, paymentId: "mock_pay_1", amount: 604720 });
    expect(dup).toEqual({ duplicate: true });
    expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, to: "PAYMENT_RECEIVED" } })).toBe(1);
  });

  it("fails the payment on amount mismatch and on gateway failure", async () => {
    const { buyer, order } = await orderFixture();
    const p = await initiateOrderPayment({ orderId: order.id, actor: buyer.actor, method: "CARD" });
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: p.paymentId } });
    await webhook({ id: "evt3", event: "payment.captured", orderId: pay.gatewayOrderId, paymentId: "x", amount: 1 });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p.paymentId } })).status).toBe("FAILED");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAYMENT_PENDING");

    const p2 = await initiateOrderPayment({ orderId: order.id, actor: buyer.actor, method: "UPI" });
    const pay2 = await prisma.payment.findUniqueOrThrow({ where: { id: p2.paymentId } });
    await webhook({ id: "evt4", event: "payment.failed", orderId: pay2.gatewayOrderId, reason: "Insufficient funds" });
    const f = await prisma.payment.findUniqueOrThrow({ where: { id: p2.paymentId } });
    expect(f.status).toBe("FAILED");
    expect(f.failureReason).toBe("Insufficient funds");
  });

  it("only the buyer can pay, and only while payment is pending", async () => {
    const { seller, order, buyer } = await orderFixture();
    await expectAppError(initiateOrderPayment({ orderId: order.id, actor: seller.actor, method: "UPI" }), "FORBIDDEN");
    await prisma.order.update({ where: { id: order.id }, data: { paymentDueAt: new Date(Date.now() - 1000) } });
    await expectAppError(initiateOrderPayment({ orderId: order.id, actor: buyer.actor, method: "UPI" }), "CONFLICT");
  });

  it("bank transfer: UTR → PROCESSING → finance confirmation → PAID", async () => {
    const { buyer, order } = await orderFixture();
    const p = await initiateOrderPayment({ orderId: order.id, actor: buyer.actor, method: "BANK_TRANSFER" });
    expect(p.offline).toBe(true);
    await submitBankTransferUtr(p.paymentId, buyer.actor, "UTR123456789");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: p.paymentId } })).status).toBe("PROCESSING");
    const dealerTry = expectAppError(confirmBankTransfer(p.paymentId, buyer.actor, "x"), "FORBIDDEN");
    await dealerTry;
    const admin = await makeAdmin();
    await confirmBankTransfer(p.paymentId, admin.actor, "Matched on statement");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAYMENT_RECEIVED");
  });

  it("refunds: partial then full, permission-checked and bounded", async () => {
    const { buyer, order } = await orderFixture();
    const p = await initiateOrderPayment({ orderId: order.id, actor: buyer.actor, method: "UPI" });
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: p.paymentId } });
    await webhook({ id: "evt5", event: "payment.captured", orderId: pay.gatewayOrderId, paymentId: "mp", amount: pay.amount });
    await expectAppError(refundPayment({ paymentId: pay.id, amount: 1000, reason: "x", actor: buyer.actor }), "FORBIDDEN");
    const admin = await makeAdmin();
    await refundPayment({ paymentId: pay.id, amount: 4720, reason: "Fee waiver", actor: admin.actor });
    let after = await prisma.payment.findUniqueOrThrow({ where: { id: pay.id } });
    expect(after.status).toBe("PARTIALLY_REFUNDED");
    expect(after.refundedAmount).toBe(4720);
    await expectAppError(refundPayment({ paymentId: pay.id, amount: 600001, reason: "too much", actor: admin.actor }), "VALIDATION");
    await refundPayment({ paymentId: pay.id, amount: 600000, reason: "Sale cancelled", actor: admin.actor });
    after = await prisma.payment.findUniqueOrThrow({ where: { id: pay.id } });
    expect(after.status).toBe("REFUNDED");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("REFUNDED");
    expect(await prisma.refund.count({ where: { paymentId: pay.id } })).toBe(2);
  });

  it("subscription payment activates the plan after verification", async () => {
    const d = await makeDealer(w);
    const p = await initiateServicePayment({ actor: d.actor, purpose: "SUBSCRIPTION", targetId: w.pro.id, method: "UPI" });
    expect(p.amount).toBe(2999 + 540);
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: p.paymentId } });
    await webhook({ id: "evt6", event: "payment.captured", orderId: pay.gatewayOrderId, paymentId: "sp", amount: pay.amount });
    const sub = await prisma.subscription.findFirstOrThrow({ where: { dealerId: d.dealer.id, status: "ACTIVE" } });
    expect(sub.planId).toBe(w.pro.id);
    expect(await prisma.invoice.count({ where: { paymentId: pay.id, type: "SERVICE_INVOICE" } })).toBe(1);
  });
});
