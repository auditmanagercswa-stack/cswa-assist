import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { acceptHighestBid, auctionSnapshot, closeAuction, closeDueAuctions, placeBid, resolveProxyBids, setAutoBid, startDueAuctions } from "@/server/services/auctions";
import { updateSetting, invalidateSettings } from "@/server/settings";
import { expectAppError, makeAdmin, makeDealer, makeLiveAuction, makeVehicle, seedWorld, type World } from "./helpers";

let w: World;
beforeEach(async () => {
  w = await seedWorld();
});

async function setup(opts: Parameters<typeof makeLiveAuction>[1] = {}) {
  const seller = await makeDealer(w);
  const v = await makeVehicle(w, seller.dealer.id, { expectedPrice: 600000 });
  const a = await makeLiveAuction(v.id, { startingBid: 500000, increment: 10000, ...opts });
  return { seller, v, a };
}

describe("bid validation", () => {
  it("accepts a valid bid and records it atomically", async () => {
    const { a, v } = await setup();
    const b = await makeDealer(w);
    const r = await placeBid({ auctionId: a.id, actor: b.actor, amount: 500000 });
    expect(r.leading).toBe(true);
    expect(r.minNext).toBe(510000);
    const after = await prisma.auction.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.currentBid).toBe(500000);
    expect(after.currentBidderId).toBe(b.user.id);
    expect(after.bidCount).toBe(1);
    const veh = await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } });
    expect(veh.currentBid).toBe(500000);
    expect(await prisma.auditLog.count({ where: { action: "bid.place", entityId: a.id } })).toBe(1);
  });

  it("enforces minimum bid and increment (spec example ₹5,25,000 → min ₹5,35,000 with ₹10k step)", async () => {
    const { a } = await setup({ startingBid: 525000 });
    const b1 = await makeDealer(w);
    const b2 = await makeDealer(w);
    await placeBid({ auctionId: a.id, actor: b1.actor, amount: 525000 });
    const err = await expectAppError(placeBid({ auctionId: a.id, actor: b2.actor, amount: 530000 }), "BID_TOO_LOW");
    expect(err.message).toContain("5,35,000");
    const ok = await placeBid({ auctionId: a.id, actor: b2.actor, amount: 540000 });
    expect(ok.currentBid).toBe(540000);
  });

  it("rejects bids after the end time, before the start, on own vehicles, from unverified and unauthenticated users", async () => {
    const { a, seller } = await setup({ endInMs: -1000 });
    const b = await makeDealer(w);
    await expectAppError(placeBid({ auctionId: a.id, actor: b.actor, amount: 600000 }), "AUCTION_ENDED");

    const v2 = await makeVehicle(w, seller.dealer.id);
    const future = await makeLiveAuction(v2.id, { startInMs: 3600_000, endInMs: 7200_000 });
    await expectAppError(placeBid({ auctionId: future.id, actor: b.actor, amount: 600000 }), "AUCTION_NOT_STARTED");

    const v3 = await makeVehicle(w, seller.dealer.id);
    const live = await makeLiveAuction(v3.id);
    await expectAppError(placeBid({ auctionId: live.id, actor: seller.actor, amount: 600000 }), "FORBIDDEN");
    expect(await prisma.fraudFlag.count({ where: { type: "SELF_BID_ATTEMPT" } })).toBe(1);

    const pending = await makeDealer(w, { status: "UNDER_REVIEW" });
    await expectAppError(placeBid({ auctionId: live.id, actor: pending.actor, amount: 600000 }), "NOT_VERIFIED");
    const noBid = await makeDealer(w, { role: "STAFF", canBid: false });
    await expectAppError(placeBid({ auctionId: live.id, actor: noBid.actor, amount: 600000 }), "FORBIDDEN");
    await expectAppError(placeBid({ auctionId: live.id, actor: null, amount: 600000 }), "UNAUTHENTICATED");
    const admin = await makeAdmin();
    await expectAppError(placeBid({ auctionId: live.id, actor: admin.actor, amount: 600000 }), "FORBIDDEN");
  });

  it("rejects non-integer amounts and absurd fat-finger bids", async () => {
    const { a } = await setup();
    const b = await makeDealer(w);
    await expectAppError(placeBid({ auctionId: a.id, actor: b.actor, amount: 510000.5 }), "VALIDATION");
    await expectAppError(placeBid({ auctionId: a.id, actor: b.actor, amount: 99_000_000 }), "VALIDATION");
  });

  it("prevents the current leader from outbidding themselves", async () => {
    const { a } = await setup();
    const b = await makeDealer(w);
    await placeBid({ auctionId: a.id, actor: b.actor, amount: 500000 });
    await expectAppError(placeBid({ auctionId: a.id, actor: b.actor, amount: 520000 }), "CONFLICT");
  });

  it("anonymises bidders in public snapshots", async () => {
    const { a } = await setup();
    const b = await makeDealer(w);
    await placeBid({ auctionId: a.id, actor: b.actor, amount: 500000 });
    const anon = await auctionSnapshot(a.id, null);
    expect(JSON.stringify(anon)).not.toContain(b.user.id);
    expect(anon!.bids[0].alias).toMatch(/^Bidder [0-9A-F]{4}$/);
    const mine = await auctionSnapshot(a.id, b.user.id);
    expect(mine!.bids[0].mine).toBe(true);
    expect(mine!.viewer!.isLeader).toBe(true);
  });
});

describe("concurrency", () => {
  it("serialises simultaneous bids — no lost updates, exactly one winner at the same amount", async () => {
    const { a } = await setup();
    const bidders = await Promise.all(Array.from({ length: 8 }, () => makeDealer(w)));
    const results = await Promise.allSettled(bidders.map((b) => placeBid({ auctionId: a.id, actor: b.actor, amount: 500000 })));
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect((r.reason as { code: string }).code).toBe("BID_TOO_LOW");
    const after = await prisma.auction.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.bidCount).toBe(1);
    expect(await prisma.bid.count({ where: { auctionId: a.id } })).toBe(1);
  });

  it("keeps aggregate state consistent under a burst of escalating concurrent bids", async () => {
    const { a } = await setup();
    const bidders = await Promise.all(Array.from({ length: 10 }, () => makeDealer(w)));
    await Promise.allSettled(bidders.map((b, i) => placeBid({ auctionId: a.id, actor: b.actor, amount: 500000 + i * 20000 })));
    const after = await prisma.auction.findUniqueOrThrow({ where: { id: a.id } });
    const bids = await prisma.bid.findMany({ where: { auctionId: a.id }, orderBy: { createdAt: "asc" } });
    expect(after.bidCount).toBe(bids.length);
    const top = Math.max(...bids.map((b) => b.amount));
    expect(after.currentBid).toBe(top);
    // every accepted bid was >= previous + increment at the time it was committed
    for (let i = 1; i < bids.length; i++) expect(bids[i].amount).toBeGreaterThanOrEqual(bids[i - 1].amount + 10000);
  });
});

describe("proxy (auto) bidding", () => {
  it("spec example: A max ₹7L, B bids ₹5.5L → system bids ₹5.6L for A", async () => {
    const { a } = await setup();
    const A = await makeDealer(w);
    const B = await makeDealer(w);
    const set = await setAutoBid({ auctionId: a.id, actor: A.actor, maxAmount: 700000 });
    expect(set.leading).toBe(true);
    expect(set.currentBid).toBe(500000); // opens at the starting bid
    const r = await placeBid({ auctionId: a.id, actor: B.actor, amount: 550000 });
    expect(r.leading).toBe(false);
    expect(r.currentBid).toBe(560000);
    const s = await prisma.auction.findUniqueOrThrow({ where: { id: a.id } });
    expect(s.currentBidderId).toBe(A.user.id);
    // max is never exposed in public state
    const snap = await auctionSnapshot(a.id, B.user.id);
    expect(JSON.stringify(snap)).not.toContain("700000");
  });

  it("continues until A's maximum is reached, then B leads", async () => {
    const { a } = await setup();
    const A = await makeDealer(w);
    const B = await makeDealer(w);
    await setAutoBid({ auctionId: a.id, actor: A.actor, maxAmount: 700000 });
    await placeBid({ auctionId: a.id, actor: B.actor, amount: 690000 });
    let s = await prisma.auction.findUniqueOrThrow({ where: { id: a.id } });
    expect(s.currentBidderId).toBe(A.user.id);
    expect(s.currentBid).toBe(700000);
    const r = await placeBid({ auctionId: a.id, actor: B.actor, amount: 710000 });
    expect(r.leading).toBe(true);
    s = await prisma.auction.findUniqueOrThrow({ where: { id: a.id } });
    expect(s.currentBid).toBe(710000);
    expect((await prisma.autoBid.findFirstOrThrow({ where: { userId: A.user.id } })).active).toBe(false);
    expect(await prisma.notification.count({ where: { userId: A.user.id, type: "OUTBID" } })).toBeGreaterThan(0);
  });

  it("two competing proxies: higher max wins at loser's max + increment; earlier wins ties", () => {
    const now = Date.now();
    const auto = (id: string, max: number, t: number) => ({ id, userId: id, dealerId: null, maxAmount: max, active: true, createdAt: new Date(now + t) });
    const r = resolveProxyBids({ startingBid: 500000, bidIncrement: 10000 }, { leaderId: null, leaderDealerId: null, price: null }, [auto("A", 700000, 0), auto("B", 650000, 1)]);
    expect(r.state.leaderId).toBe("A");
    expect(r.state.price).toBe(660000);
    const tie = resolveProxyBids({ startingBid: 500000, bidIncrement: 10000 }, { leaderId: null, leaderDealerId: null, price: null }, [auto("A", 650000, 0), auto("B", 650000, 1)]);
    expect(tie.state.leaderId).toBe("A");
    expect(tie.state.price).toBe(650000);
  });

  it("rejects an auto-bid maximum below the next minimum", async () => {
    const { a } = await setup();
    const A = await makeDealer(w);
    await expectAppError(setAutoBid({ auctionId: a.id, actor: A.actor, maxAmount: 400000 }), "BID_TOO_LOW");
  });
});

describe("anti-sniping", () => {
  it("extends the auction when a bid lands inside the trigger window", async () => {
    const { a } = await setup({ endInMs: 60_000 });
    const b = await makeDealer(w);
    const r = await placeBid({ auctionId: a.id, actor: b.actor, amount: 500000 });
    expect(r.extended).toBe(true);
    expect(new Date(r.endAt).getTime()).toBe(a.endAt.getTime() + 120_000);
    const s = await prisma.auction.findUniqueOrThrow({ where: { id: a.id } });
    expect(s.extensionCount).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "auction.extend", entityId: a.id } })).toBe(1);
  });

  it("does not extend outside the window and respects the configured max extensions", async () => {
    const far = await setup({ endInMs: 3600_000 });
    const b = await makeDealer(w);
    expect((await placeBid({ auctionId: far.a.id, actor: b.actor, amount: 500000 })).extended).toBe(false);

    const admin = await makeAdmin();
    await updateSetting("auction.maxExtensions", 1, admin.user.id);
    invalidateSettings();
    const near = await setup({ endInMs: 30_000 });
    await prisma.auction.update({ where: { id: near.a.id }, data: { maxExtensions: 1, extensionCount: 1 } });
    expect((await placeBid({ auctionId: near.a.id, actor: b.actor, amount: 500000 })).extended).toBe(false);
  });
});

describe("auction completion", () => {
  it("closes as WON when reserve is met: order with fees, winner & seller notified, no further bids", async () => {
    const { a, v, seller } = await setup({ reserve: 550000, endInMs: 3600_000 });
    const b = await makeDealer(w);
    await placeBid({ auctionId: a.id, actor: b.actor, amount: 600000 });
    await prisma.auction.update({ where: { id: a.id }, data: { endAt: new Date(Date.now() - 1000) } });
    expect(await closeDueAuctions()).toBe(1);
    const closed = await prisma.auction.findUniqueOrThrow({ where: { id: a.id } });
    expect(closed.status).toBe("ENDED");
    expect(closed.result).toBe("WON");
    expect(closed.winnerId).toBe(b.user.id);
    const order = await prisma.order.findFirstOrThrow({ where: { auctionId: a.id } });
    expect(order.buyerTotal).toBe(604720);
    expect(order.sellerNet).toBe(594000);
    expect(order.status).toBe("PAYMENT_PENDING");
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("RESERVED");
    expect(await prisma.notification.count({ where: { userId: b.user.id, type: "AUCTION_WON" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: seller.user.id, type: "AUCTION_SOLD" } })).toBe(1);
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(2);
    const late = await makeDealer(w);
    await expectAppError(placeBid({ auctionId: a.id, actor: late.actor, amount: 700000 }), "AUCTION_ENDED");
  });

  it("marks RESERVE_NOT_MET and lets the seller accept the highest bid", async () => {
    const { a, seller } = await setup({ reserve: 800000 });
    const b = await makeDealer(w);
    await placeBid({ auctionId: a.id, actor: b.actor, amount: 600000 });
    await closeAuction(a.id, { force: true });
    const c = await prisma.auction.findUniqueOrThrow({ where: { id: a.id } });
    expect(c.result).toBe("RESERVE_NOT_MET");
    expect(await prisma.order.count({ where: { auctionId: a.id } })).toBe(0);
    const order = await acceptHighestBid(a.id, seller.actor);
    expect(order.vehiclePrice).toBe(600000);
    expect(order.buyerId).toBe(b.user.id);
  });

  it("marks NO_BIDS and returns the vehicle to AUCTION_ENDED", async () => {
    const { a, v } = await setup({ endInMs: -10 });
    await closeDueAuctions();
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: a.id } })).result).toBe("NO_BIDS");
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("AUCTION_ENDED");
  });

  it("starts scheduled auctions when their start time passes", async () => {
    const seller = await makeDealer(w);
    const v = await makeVehicle(w, seller.dealer.id);
    const a = await makeLiveAuction(v.id, { startInMs: 3600_000, endInMs: 7200_000 });
    await prisma.auction.update({ where: { id: a.id }, data: { startAt: new Date(Date.now() - 1000) } });
    expect(await startDueAuctions()).toBe(1);
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("LIVE");
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("AUCTION_LIVE");
  });
});
