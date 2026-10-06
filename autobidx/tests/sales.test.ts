import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { buyNow, expireOffers, makeOffer, respondToOffer } from "@/server/services/sales";
import { placeBid } from "@/server/services/auctions";
import { expectAppError, makeDealer, makeLiveAuction, makeVehicle, seedWorld, type World } from "./helpers";

let w: World;
beforeEach(async () => {
  w = await seedWorld();
});

describe("Buy Now", () => {
  it("locks the vehicle, creates an order with server-computed fees and invoices", async () => {
    const seller = await makeDealer(w);
    const buyer = await makeDealer(w);
    const v = await makeVehicle(w, seller.dealer.id, { buyNowEnabled: true, buyNowPrice: 600000 });
    const order = await buyNow({ vehicleId: v.id, actor: buyer.actor });
    expect(order.source).toBe("BUY_NOW");
    expect(order.vehiclePrice).toBe(600000);
    expect(order.buyerTotal).toBe(604720);
    expect(order.sellerNet).toBe(594000);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("RESERVED");
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(2);
    expect(await prisma.orderItem.count({ where: { orderId: order.id } })).toBeGreaterThanOrEqual(4);
  });

  it("prevents double purchase under concurrency", async () => {
    const seller = await makeDealer(w);
    const v = await makeVehicle(w, seller.dealer.id, { buyNowEnabled: true, buyNowPrice: 600000 });
    const buyers = await Promise.all(Array.from({ length: 6 }, () => makeDealer(w)));
    const res = await Promise.allSettled(buyers.map((b) => buyNow({ vehicleId: v.id, actor: b.actor })));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of res) if (r.status === "rejected") expect((r.reason as { code: string }).code).toBe("ALREADY_SOLD");
    expect(await prisma.order.count({ where: { vehicleId: v.id } })).toBe(1);
  });

  it("is blocked when disabled, for own vehicles, and once bids pass the Buy Now price", async () => {
    const seller = await makeDealer(w);
    const buyer = await makeDealer(w);
    const off = await makeVehicle(w, seller.dealer.id, { buyNowEnabled: false });
    await expectAppError(buyNow({ vehicleId: off.id, actor: buyer.actor }), "CONFLICT");
    const own = await makeVehicle(w, seller.dealer.id, { buyNowEnabled: true, buyNowPrice: 600000 });
    await expectAppError(buyNow({ vehicleId: own.id, actor: seller.actor }), "FORBIDDEN");
    const live = await makeVehicle(w, seller.dealer.id, { buyNowEnabled: true, buyNowPrice: 600000 });
    const a = await makeLiveAuction(live.id, { startingBid: 590000 });
    const bidder = await makeDealer(w);
    await placeBid({ auctionId: a.id, actor: bidder.actor, amount: 610000 });
    await expectAppError(buyNow({ vehicleId: live.id, actor: buyer.actor }), "CONFLICT");
  });

  it("closes a running auction (below Buy Now price) when bought", async () => {
    const seller = await makeDealer(w);
    const buyer = await makeDealer(w);
    const v = await makeVehicle(w, seller.dealer.id, { buyNowEnabled: true, buyNowPrice: 700000 });
    const a = await makeLiveAuction(v.id);
    await buyNow({ vehicleId: v.id, actor: buyer.actor });
    const after = await prisma.auction.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.status).toBe("ENDED");
    expect(after.result).toBe("SOLD_BUY_NOW");
  });
});

describe("offers & negotiation", () => {
  it("offer → counter → counter → accept creates an order at the agreed price", async () => {
    const seller = await makeDealer(w);
    const buyer = await makeDealer(w);
    const v = await makeVehicle(w, seller.dealer.id, { expectedPrice: 1000000 });
    const offer = await makeOffer({ vehicleId: v.id, actor: buyer.actor, amount: 900000, message: "Cash ready" });
    expect(offer.awaiting).toBe("SELLER");
    expect(await prisma.notification.count({ where: { userId: seller.user.id, type: "OFFER_RECEIVED" } })).toBe(1);
    // buyer cannot respond on seller's turn
    await expectAppError(respondToOffer({ offerId: offer.id, actor: buyer.actor, action: "accept" }), "CONFLICT");
    await respondToOffer({ offerId: offer.id, actor: seller.actor, action: "counter", amount: 980000 });
    await expectAppError(respondToOffer({ offerId: offer.id, actor: buyer.actor, action: "counter", amount: 990000 }), "VALIDATION");
    await respondToOffer({ offerId: offer.id, actor: buyer.actor, action: "counter", amount: 950000 });
    const { order } = await respondToOffer({ offerId: offer.id, actor: seller.actor, action: "accept" });
    expect(order!.vehiclePrice).toBe(950000);
    expect(order!.source).toBe("OFFER");
    expect(await prisma.offerCounter.count({ where: { offerId: offer.id } })).toBe(4);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } })).status).toBe("ACCEPTED");
  });

  it("validates offer amount, duplicates, own vehicles and strangers", async () => {
    const seller = await makeDealer(w);
    const buyer = await makeDealer(w);
    const stranger = await makeDealer(w);
    const v = await makeVehicle(w, seller.dealer.id, { expectedPrice: 1000000 });
    await expectAppError(makeOffer({ vehicleId: v.id, actor: buyer.actor, amount: 100000 }), "VALIDATION");
    await expectAppError(makeOffer({ vehicleId: v.id, actor: seller.actor, amount: 900000 }), "FORBIDDEN");
    const o = await makeOffer({ vehicleId: v.id, actor: buyer.actor, amount: 900000 });
    await expectAppError(makeOffer({ vehicleId: v.id, actor: buyer.actor, amount: 910000 }), "CONFLICT");
    await expectAppError(respondToOffer({ offerId: o.id, actor: stranger.actor, action: "reject" }), "NOT_FOUND");
  });

  it("accepting one offer closes the others; offers expire", async () => {
    const seller = await makeDealer(w);
    const b1 = await makeDealer(w);
    const b2 = await makeDealer(w);
    const v = await makeVehicle(w, seller.dealer.id, { expectedPrice: 1000000 });
    const o1 = await makeOffer({ vehicleId: v.id, actor: b1.actor, amount: 900000 });
    const o2 = await makeOffer({ vehicleId: v.id, actor: b2.actor, amount: 910000 });
    await respondToOffer({ offerId: o2.id, actor: seller.actor, action: "accept" });
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: o1.id } })).status).toBe("EXPIRED");

    const v2 = await makeVehicle(w, seller.dealer.id, { expectedPrice: 1000000 });
    const o3 = await makeOffer({ vehicleId: v2.id, actor: b1.actor, amount: 900000 });
    await prisma.offer.update({ where: { id: o3.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await expireOffers()).toBe(1);
  });
});
