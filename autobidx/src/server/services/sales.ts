import { prisma, type Tx } from "@/lib/db";
import { AppError, conflict, forbidden, notFound } from "@/lib/errors";
import { formatINR } from "@/lib/format";
import type { Actor } from "../auth/rbac";
import { requireVerifiedBuyer, requireVerifiedSeller } from "../auth/rbac";
import { audit } from "../audit";
import { notify, notifyDealer } from "../notifications/notify";
import { getSetting, getSettings } from "../settings";
import { createOrderTx } from "./orders";
import { publish } from "../realtime/bus";
import { registerJob } from "../jobs/queue";
import type { Vehicle } from "@prisma/client";

/** Row-locks the vehicle so concurrent Buy Now / offer acceptance can't double-sell it. */
async function lockVehicle(tx: Tx, vehicleId: string): Promise<Vehicle> {
  const rows = await tx.$queryRaw<Vehicle[]>`SELECT * FROM "Vehicle" WHERE id = ${vehicleId} FOR UPDATE`;
  if (!rows[0]) throw notFound("Vehicle not found.");
  return rows[0];
}

// ───────────────────────── Buy Now ─────────────────────────

/**
 * 1. check availability  2. lock vehicle  3. create order  4–6. fees, seller proceeds, buyer payable
 * 7. invoices  8. payment request (created when the buyer proceeds to checkout).
 */
export async function buyNow(input: { vehicleId: string; actor: Actor | null; ip?: string | null }) {
  if (!(await getSetting("features.buyNow"))) throw forbidden("Buy Now is currently disabled.");
  const buyer = await requireVerifiedBuyer(input.actor);
  return prisma.$transaction(
    async (tx) => {
      const v = await lockVehicle(tx, input.vehicleId);
      if (buyer.dealer && v.dealerId === buyer.dealer.id) throw forbidden("You cannot buy your own vehicle.");
      if (!v.buyNowEnabled || !v.buyNowPrice) throw conflict("Buy Now is not available for this vehicle.");
      if (v.status === "SOLD" || v.status === "RESERVED") throw new AppError("ALREADY_SOLD", "Vehicle has already been sold.");
      if (v.status !== "PUBLISHED" && v.status !== "AUCTION_LIVE") throw conflict("This vehicle is not available for purchase.");

      // If an auction is running, Buy Now is allowed only while bids are below the Buy Now price.
      const auctionRows = await tx.$queryRaw<{ id: string; currentBid: number | null }[]>`
        SELECT id, "currentBid" FROM "Auction" WHERE "vehicleId" = ${v.id} AND status IN ('LIVE','SCHEDULED') FOR UPDATE`;
      const auction = auctionRows[0];
      if (auction && auction.currentBid != null && auction.currentBid >= v.buyNowPrice)
        throw conflict("Bidding has passed the Buy Now price — place a bid instead.");

      const order = await createOrderTx(tx, {
        vehicle: v,
        source: "BUY_NOW",
        buyerId: buyer.userId,
        buyerDealerId: buyer.dealer?.id ?? null,
        price: v.buyNowPrice,
        actorId: buyer.userId,
        ip: input.ip,
      });

      if (auction) {
        await tx.auction.update({ where: { id: auction.id }, data: { status: "ENDED", result: "SOLD_BUY_NOW", closedAt: new Date() } });
        await tx.autoBid.updateMany({ where: { auctionId: auction.id }, data: { active: false } });
        const bidders = await tx.bid.findMany({ where: { auctionId: auction.id }, distinct: ["bidderId"], select: { bidderId: true } });
        if (bidders.length)
          await notify(bidders.map((b) => b.bidderId), { type: "AUCTION_UNSOLD", title: "Vehicle sold via Buy Now", body: `${v.title} was purchased at the Buy Now price. The auction has closed.`, link: `/auctions/${auction.id}` }, tx);
        await publish({ type: "auction.closed", auctionId: auction.id, data: { result: "SOLD_BUY_NOW" } }, tx);
      }
      // Close any open offers on this vehicle.
      await expireOpenOffersTx(tx, v.id, "Vehicle sold");
      await audit({ userId: buyer.userId, action: "vehicle.buy_now", entityType: "Vehicle", entityId: v.id, after: { orderId: order.id, price: v.buyNowPrice }, ip: input.ip }, tx);
      return order;
    },
    { timeout: 20000 },
  );
}

// ───────────────────────── Offers & negotiation ─────────────────────────

async function expireOpenOffersTx(tx: Tx, vehicleId: string, reason: string) {
  const open = await tx.offer.findMany({ where: { vehicleId, status: { in: ["PENDING", "COUNTERED"] } } });
  for (const o of open) {
    await tx.offer.update({ where: { id: o.id }, data: { status: "EXPIRED" } });
    await notify(o.buyerId, { type: "OFFER_REJECTED", title: "Offer closed", body: `Your offer was closed: ${reason}.`, link: "/dashboard/offers" }, tx);
  }
}

export async function makeOffer(input: { vehicleId: string; actor: Actor | null; amount: number; message?: string; ip?: string | null }) {
  if (!(await getSetting("features.offers"))) throw forbidden("Offers are currently disabled.");
  const buyer = await requireVerifiedBuyer(input.actor);
  const cfg = await getSettings(["offers.expiryHours", "offers.minPercentOfAsking"]);
  return prisma.$transaction(async (tx) => {
    const v = await lockVehicle(tx, input.vehicleId);
    if (buyer.dealer && v.dealerId === buyer.dealer.id) throw forbidden("You cannot make an offer on your own vehicle.");
    if (!v.offersEnabled) throw conflict("The seller is not accepting offers on this vehicle.");
    if (v.status === "AUCTION_LIVE") throw conflict("This vehicle is in a live auction — place a bid instead.");
    if (v.status !== "PUBLISHED" && v.status !== "AUCTION_ENDED") throw conflict("This vehicle is not available for offers.");
    const minAmount = Math.round((v.expectedPrice * cfg["offers.minPercentOfAsking"]) / 100);
    if (!Number.isInteger(input.amount) || input.amount < minAmount)
      throw new AppError("VALIDATION", `Offers must be at least ${formatINR(minAmount)} (${cfg["offers.minPercentOfAsking"]}% of asking).`);
    if (v.buyNowPrice && input.amount >= v.buyNowPrice) throw new AppError("VALIDATION", "Your offer meets the Buy Now price — use Buy Now instead.");
    const existing = await tx.offer.findFirst({ where: { vehicleId: v.id, buyerId: buyer.userId, status: { in: ["PENDING", "COUNTERED"] } } });
    if (existing) throw conflict("You already have an open offer on this vehicle.");

    const offer = await tx.offer.create({
      data: {
        vehicleId: v.id,
        buyerId: buyer.userId,
        buyerDealerId: buyer.dealer?.id ?? null,
        sellerDealerId: v.dealerId,
        amount: input.amount,
        currentAmount: input.amount,
        awaiting: "SELLER",
        message: input.message?.slice(0, 500),
        expiresAt: new Date(Date.now() + cfg["offers.expiryHours"] * 3600_000),
        counters: { create: { by: "BUYER", amount: input.amount, message: input.message?.slice(0, 500) } },
      },
    });
    await tx.vehicle.update({ where: { id: v.id }, data: { enquiryCount: { increment: 1 } } });
    await audit({ userId: buyer.userId, action: "offer.create", entityType: "Offer", entityId: offer.id, after: { amount: input.amount }, ip: input.ip }, tx);
    await notifyDealer(v.dealerId, {
      type: "OFFER_RECEIVED",
      title: "New offer received",
      body: `${buyer.dealer?.name ?? buyer.name} offered ${formatINR(input.amount)} for ${v.title}. Expires in ${cfg["offers.expiryHours"]}h.`,
      link: "/dashboard/offers",
    }, tx);
    return offer;
  });
}

type OfferAction = { action: "accept" } | { action: "reject"; message?: string } | { action: "counter"; amount: number; message?: string } | { action: "withdraw" };

export async function respondToOffer(input: { offerId: string; actor: Actor | null; ip?: string | null } & OfferAction) {
  const actor = input.actor;
  if (!actor) throw forbidden();
  const maxRounds = await getSetting("offers.maxRounds");
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Offer" WHERE id = ${input.offerId} FOR UPDATE`;
    if (!rows[0]) throw notFound("Offer not found.");
    const offer = await tx.offer.findUniqueOrThrow({ where: { id: input.offerId }, include: { vehicle: true } });
    const isBuyer = offer.buyerId === actor.userId;
    const isSeller = !!actor.dealer && actor.dealer.id === offer.sellerDealerId;
    if (!isBuyer && !isSeller) throw notFound("Offer not found.");
    if (offer.status !== "PENDING" && offer.status !== "COUNTERED") throw conflict("This offer is no longer open.");
    if (offer.expiresAt < new Date()) {
      await tx.offer.update({ where: { id: offer.id }, data: { status: "EXPIRED" } });
      throw conflict("This offer has expired.");
    }
    const party = isSeller ? "SELLER" : "BUYER";
    const counterpartyNotify = (msg: { type: "OFFER_ACCEPTED" | "OFFER_REJECTED" | "COUNTER_OFFER"; title: string; body: string }) =>
      party === "SELLER" ? notify(offer.buyerId, { ...msg, link: "/dashboard/offers" }, tx) : notifyDealer(offer.sellerDealerId, { ...msg, link: "/dashboard/offers" }, tx);

    if (input.action === "withdraw") {
      if (!isBuyer) throw forbidden();
      await tx.offer.update({ where: { id: offer.id }, data: { status: "WITHDRAWN" } });
      await audit({ userId: actor.userId, action: "offer.withdraw", entityType: "Offer", entityId: offer.id, ip: input.ip }, tx);
      return { offer: await tx.offer.findUniqueOrThrow({ where: { id: offer.id } }), order: null };
    }
    if (offer.awaiting !== party) throw conflict("Waiting for the other party to respond.");

    if (input.action === "reject") {
      await tx.offer.update({ where: { id: offer.id }, data: { status: "REJECTED" } });
      await tx.offerCounter.create({ data: { offerId: offer.id, by: party, amount: offer.currentAmount, message: input.message ?? "Rejected" } });
      await audit({ userId: actor.userId, action: "offer.reject", entityType: "Offer", entityId: offer.id, ip: input.ip }, tx);
      await counterpartyNotify({ type: "OFFER_REJECTED", title: "Offer declined", body: `The offer of ${formatINR(offer.currentAmount)} on ${offer.vehicle.title} was declined.` });
      return { offer: await tx.offer.findUniqueOrThrow({ where: { id: offer.id } }), order: null };
    }

    if (input.action === "counter") {
      if (offer.rounds >= maxRounds) throw conflict("Maximum negotiation rounds reached — accept or decline.");
      if (!Number.isInteger(input.amount) || input.amount <= 0) throw new AppError("VALIDATION", "Enter a valid amount.");
      if (party === "SELLER" && input.amount <= offer.currentAmount) throw new AppError("VALIDATION", "A counter-offer must be higher than the buyer's offer.");
      if (party === "BUYER" && input.amount >= offer.currentAmount) throw new AppError("VALIDATION", "Your counter should be below the seller's counter — or accept it.");
      const expiryHours = await getSetting("offers.expiryHours", tx);
      await tx.offer.update({
        where: { id: offer.id },
        data: { status: "COUNTERED", currentAmount: input.amount, awaiting: party === "SELLER" ? "BUYER" : "SELLER", rounds: { increment: 1 }, expiresAt: new Date(Date.now() + expiryHours * 3600_000) },
      });
      await tx.offerCounter.create({ data: { offerId: offer.id, by: party, amount: input.amount, message: input.message?.slice(0, 500) } });
      await audit({ userId: actor.userId, action: "offer.counter", entityType: "Offer", entityId: offer.id, after: { amount: input.amount }, ip: input.ip }, tx);
      await counterpartyNotify({ type: "COUNTER_OFFER", title: "Counter-offer received", body: `${offer.vehicle.title}: counter-offer of ${formatINR(input.amount)}.` });
      return { offer: await tx.offer.findUniqueOrThrow({ where: { id: offer.id } }), order: null };
    }

    // accept
    if (party === "SELLER") requireVerifiedSeller(actor);
    else await requireVerifiedBuyer(actor);
    const v = await lockVehicle(tx, offer.vehicleId);
    if (v.status === "SOLD" || v.status === "RESERVED") throw new AppError("ALREADY_SOLD", "Vehicle has already been sold.");
    if (v.status === "AUCTION_LIVE") throw conflict("The vehicle is in a live auction.");
    await tx.offer.update({ where: { id: offer.id }, data: { status: "ACCEPTED" } });
    await tx.offerCounter.create({ data: { offerId: offer.id, by: party, amount: offer.currentAmount, message: "Accepted" } });
    const order = await createOrderTx(tx, {
      vehicle: v,
      source: "OFFER",
      buyerId: offer.buyerId,
      buyerDealerId: offer.buyerDealerId,
      price: offer.currentAmount,
      offerId: offer.id,
      actorId: actor.userId,
      ip: input.ip,
    });
    // Other open offers on the vehicle are closed.
    const others = await tx.offer.findMany({ where: { vehicleId: v.id, id: { not: offer.id }, status: { in: ["PENDING", "COUNTERED"] } } });
    for (const o of others) {
      await tx.offer.update({ where: { id: o.id }, data: { status: "EXPIRED" } });
      await notify(o.buyerId, { type: "OFFER_REJECTED", title: "Vehicle sold", body: `${v.title} was sold to another buyer.`, link: "/dashboard/offers" }, tx);
    }
    await audit({ userId: actor.userId, action: "offer.accept", entityType: "Offer", entityId: offer.id, after: { amount: offer.currentAmount, orderId: order.id }, ip: input.ip }, tx);
    await counterpartyNotify({ type: "OFFER_ACCEPTED", title: "Offer accepted!", body: `${offer.vehicle.title} at ${formatINR(offer.currentAmount)}. Order ${order.orderNumber} created.` });
    return { offer: await tx.offer.findUniqueOrThrow({ where: { id: offer.id } }), order };
  });
}

export async function expireOffers() {
  const res = await prisma.offer.updateMany({ where: { status: { in: ["PENDING", "COUNTERED"] }, expiresAt: { lt: new Date() } }, data: { status: "EXPIRED" } });
  return res.count;
}

registerJob("offers.expire", async () => {
  await expireOffers();
});
