import { prisma, type Tx } from "@/lib/db";
import { AppError, conflict, forbidden, notFound } from "@/lib/errors";
import { formatINR } from "@/lib/format";
import { sha256 } from "@/lib/crypto";
import type { Auction, AutoBid } from "@prisma/client";
import type { Actor } from "../auth/rbac";
import { can, requireVerifiedBuyer } from "../auth/rbac";
import { audit } from "../audit";
import { publish } from "../realtime/bus";
import { notify, notifyDealer } from "../notifications/notify";
import { getSetting, getSettings, incrementFor } from "../settings";
import { createOrderTx } from "./orders";
import { registerJob } from "../jobs/queue";
import { checkSellerLink, flagBidCancellations, flagRapidBidding, flagShillAttempt } from "./fraud";

/**
 * AUCTION ENGINE
 * ──────────────
 * Every state change happens inside a DB transaction that first takes a row lock on the auction
 * (SELECT … FOR UPDATE). Concurrent bids therefore serialize on that lock and each one validates
 * against the latest committed state — two simultaneous bids can never overwrite each other.
 * The server clock and DB state are authoritative; clients only render snapshots.
 */

type LockedAuction = Auction & { vehicleDealerId: string; vehicleTitle: string; vehicleExpectedPrice: number };

async function lockAuction(tx: Tx, auctionId: string): Promise<LockedAuction> {
  const rows = await tx.$queryRaw<Auction[]>`SELECT * FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
  const a = rows[0];
  if (!a) throw notFound("Auction not found.");
  const v = await tx.vehicle.findUniqueOrThrow({ where: { id: a.vehicleId }, select: { dealerId: true, title: true, expectedPrice: true } });
  return { ...a, vehicleDealerId: v.dealerId, vehicleTitle: v.title, vehicleExpectedPrice: v.expectedPrice };
}

export function bidderAlias(auctionId: string, userId: string) {
  return `Bidder ${sha256(`${auctionId}:${userId}`).slice(0, 4).toUpperCase()}`;
}

export function minimumNextBid(a: Pick<Auction, "currentBid" | "bidIncrement" | "startingBid">) {
  return a.currentBid == null ? a.startingBid : a.currentBid + a.bidIncrement;
}

/** Effective status using the server clock (covers the gap before the scheduler runs). */
export function effectiveStatus(a: Pick<Auction, "status" | "startAt" | "endAt">, now = new Date()) {
  if (a.status === "SCHEDULED" && a.startAt <= now) return a.endAt <= now ? "ENDED" : "LIVE";
  if (a.status === "LIVE" && a.endAt <= now) return "ENDED";
  return a.status;
}

type BidDraft = { userId: string; dealerId: string | null; amount: number; isAuto: boolean };

type State = { leaderId: string | null; leaderDealerId: string | null; price: number | null };

/**
 * Proxy (auto) bidding resolution. Repeatedly lets the strongest competing auto-bid challenge the
 * current leader, bidding only the minimum needed (leader's max + increment), until no auto-bid can
 * beat the standing price. Maximums are never revealed — only resulting bids are recorded.
 * Ties go to the earlier auto-bid.
 */
export function resolveProxyBids(
  auction: Pick<Auction, "startingBid" | "bidIncrement">,
  start: State,
  autos: Pick<AutoBid, "id" | "userId" | "dealerId" | "maxAmount" | "active" | "createdAt">[],
): { state: State; bids: BidDraft[]; exhausted: string[] } {
  const inc = auction.bidIncrement;
  const pool = autos.filter((a) => a.active).map((a) => ({ ...a }));
  const state = { ...start };
  const bids: BidDraft[] = [];
  const exhausted = new Set<string>();

  for (let guard = 0; guard < 500; guard++) {
    const required = state.price == null ? auction.startingBid : state.price + inc;
    const leaderAuto = pool.find((a) => a.userId === state.leaderId && a.active);
    const leaderMax = state.price == null ? 0 : Math.max(leaderAuto?.maxAmount ?? 0, state.price);
    const challengers = pool
      .filter((a) => a.active && a.userId !== state.leaderId && a.maxAmount >= required)
      .sort((a, b) => b.maxAmount - a.maxAmount || a.createdAt.getTime() - b.createdAt.getTime());
    const c = challengers[0];
    if (!c) break;

    if (state.leaderId == null) {
      bids.push({ userId: c.userId, dealerId: c.dealerId, amount: required, isAuto: true });
      Object.assign(state, { leaderId: c.userId, leaderDealerId: c.dealerId, price: required });
      continue;
    }

    const leaderWins = c.maxAmount < leaderMax || (c.maxAmount === leaderMax && !!leaderAuto && leaderAuto.createdAt <= c.createdAt);
    if (!leaderWins) {
      // Challenger overtakes; the leader's proxy (if any) is exhausted at its max.
      if (leaderAuto) {
        if (leaderMax > (state.price ?? 0)) bids.push({ userId: leaderAuto.userId, dealerId: leaderAuto.dealerId, amount: leaderMax, isAuto: true });
        leaderAuto.active = false;
        exhausted.add(leaderAuto.id);
      }
      const newPrice = Math.max(required, Math.min(c.maxAmount, leaderMax + inc));
      bids.push({ userId: c.userId, dealerId: c.dealerId, amount: newPrice, isAuto: true });
      Object.assign(state, { leaderId: c.userId, leaderDealerId: c.dealerId, price: newPrice });
    } else {
      // Leader's proxy defends; the challenger's proxy is exhausted at its max.
      bids.push({ userId: c.userId, dealerId: c.dealerId, amount: c.maxAmount, isAuto: true });
      c.active = false;
      exhausted.add(c.id);
      const defend = Math.min(leaderMax, c.maxAmount + inc);
      bids.push({ userId: state.leaderId, dealerId: state.leaderDealerId, amount: defend, isAuto: true });
      state.price = defend;
    }
  }
  // Any non-leading proxy that can no longer reach the next minimum is spent.
  if (state.price != null) {
    for (const a of pool) {
      if (a.active && a.userId !== state.leaderId && a.maxAmount < state.price + inc) {
        a.active = false;
        exhausted.add(a.id);
      }
    }
  }
  return { state, bids, exhausted: [...exhausted] };
}

async function validateBidder(actor: Actor | null, auction: LockedAuction) {
  const a = await requireVerifiedBuyer(actor);
  if (a.dealer && a.dealer.id === auction.vehicleDealerId) {
    await flagShillAttempt(a.userId, a.dealer.id, auction.id);
    throw forbidden("You cannot bid on your own vehicle.");
  }
  return a;
}

function assertLive(a: LockedAuction, now: Date) {
  if (a.status === "CANCELLED") throw new AppError("AUCTION_ENDED", "This auction has been cancelled.");
  const st = effectiveStatus(a, now);
  if (st === "SCHEDULED") throw new AppError("AUCTION_NOT_STARTED", "This auction hasn't started yet.");
  if (st === "ENDED") throw new AppError("AUCTION_ENDED", "Auction has ended.");
}

type Outcome = {
  bids: { id: string; userId: string; amount: number; isAuto: boolean; createdAt: Date }[];
  extended: boolean;
  previousLeaderId: string | null;
  auction: Auction;
};

/** Persists drafted bids, applies anti-sniping, updates the auction aggregate, emits events. */
async function commitBids(
  tx: Tx,
  auction: LockedAuction,
  drafts: BidDraft[],
  final: State,
  exhaustedAutoIds: string[],
  meta: { actorId: string; ip: string | null; now: Date },
): Promise<Outcome> {
  const created: Outcome["bids"] = [];
  for (const d of drafts) {
    const b = await tx.bid.create({
      data: { auctionId: auction.id, bidderId: d.userId, dealerId: d.dealerId, amount: d.amount, isAuto: d.isAuto, ip: d.userId === meta.actorId && !d.isAuto ? meta.ip : null },
    });
    created.push({ id: b.id, userId: b.bidderId, amount: b.amount, isAuto: b.isAuto, createdAt: b.createdAt });
  }
  if (exhaustedAutoIds.length) await tx.autoBid.updateMany({ where: { id: { in: exhaustedAutoIds } }, data: { active: false } });

  // Anti-sniping: a bid in the final trigger window pushes the end time out.
  let endAt = auction.endAt;
  let extended = false;
  const remainingMs = auction.endAt.getTime() - meta.now.getTime();
  if (created.length && remainingMs <= auction.extendTriggerSec * 1000 && (auction.maxExtensions === 0 || auction.extensionCount < auction.maxExtensions)) {
    endAt = new Date(auction.endAt.getTime() + auction.extendBySec * 1000);
    extended = true;
  }

  const bidderCount = await tx.bid
    .groupBy({ by: ["bidderId"], where: { auctionId: auction.id, status: "VALID" } })
    .then((g) => g.length);

  const updated = await tx.auction.update({
    where: { id: auction.id },
    data: {
      status: "LIVE",
      currentBid: final.price,
      currentBidderId: final.leaderId,
      bidCount: { increment: created.length },
      bidderCount,
      endAt,
      extensionCount: extended ? { increment: 1 } : undefined,
    },
  });
  await tx.vehicle.update({
    where: { id: auction.vehicleId },
    data: { status: "AUCTION_LIVE", currentBid: updated.currentBid, bidCount: updated.bidCount, auctionEndAt: updated.endAt },
  });

  for (const b of created) {
    await audit({ userId: b.userId, action: b.isAuto ? "bid.auto" : "bid.place", entityType: "Auction", entityId: auction.id, after: { bidId: b.id, amount: b.amount }, ip: b.isAuto ? null : meta.ip }, tx);
  }
  if (extended) {
    await audit({ action: "auction.extend", entityType: "Auction", entityId: auction.id, before: { endAt: auction.endAt }, after: { endAt, reason: "anti-sniping" } }, tx);
  }

  const reserveMet = updated.reservePrice == null || (updated.currentBid ?? 0) >= updated.reservePrice;
  await publish(
    {
      type: "auction.bid",
      auctionId: auction.id,
      data: {
        currentBid: updated.currentBid,
        minNext: minimumNextBid(updated),
        bidCount: updated.bidCount,
        bidderCount: updated.bidderCount,
        endAt: updated.endAt.toISOString(),
        extended,
        reserveMet,
        leaderAlias: updated.currentBidderId ? bidderAlias(auction.id, updated.currentBidderId) : null,
        bids: created.map((b) => ({ id: b.id, amount: b.amount, isAuto: b.isAuto, at: b.createdAt.toISOString(), alias: bidderAlias(auction.id, b.userId) })),
      },
    },
    tx,
  );

  // Notifications: outbid users (anyone who led or had a proxy and no longer leads) + seller.
  const outbid = new Set<string>();
  if (auction.currentBidderId && auction.currentBidderId !== final.leaderId) outbid.add(auction.currentBidderId);
  for (const b of created) if (b.userId !== final.leaderId) outbid.add(b.userId);
  const link = `/auctions/${auction.id}`;
  for (const uid of outbid) {
    await notify(uid, { type: "OUTBID", title: "You've been outbid", body: `${auction.vehicleTitle}: current bid is now ${formatINR(final.price)}.`, link }, tx);
  }
  await notifyDealer(auction.vehicleDealerId, { type: "NEW_BID", title: "New bid on your vehicle", body: `${auction.vehicleTitle}: ${formatINR(final.price)} (${updated.bidCount} bids).`, link }, tx);

  return { bids: created, extended, previousLeaderId: auction.currentBidderId, auction: updated };
}

export async function placeBid(input: { auctionId: string; actor: Actor | null; amount: number; ip?: string | null }) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new AppError("VALIDATION", "Enter a valid bid amount in whole rupees.");
  const outcome = await prisma.$transaction(
    async (tx) => {
      const auction = await lockAuction(tx, input.auctionId);
      const actor = await validateBidder(input.actor, auction);
      const now = new Date();
      assertLive(auction, now);

      const minNext = minimumNextBid(auction);
      if (input.amount < minNext) throw new AppError("BID_TOO_LOW", `Your bid must be at least ${formatINR(minNext)}.`, { minNext });
      const multiplier = await getSetting("bidding.maxBidMultiplier", tx);
      const ceiling = Math.max(auction.vehicleExpectedPrice, auction.reservePrice ?? 0, auction.startingBid) * multiplier;
      if (input.amount > ceiling) throw new AppError("VALIDATION", `That bid looks unusually high. Maximum allowed is ${formatINR(ceiling)}.`);
      if (auction.currentBidderId === actor.userId) throw conflict("You're already the highest bidder.");

      const drafts: BidDraft[] = [{ userId: actor.userId, dealerId: actor.dealer?.id ?? null, amount: input.amount, isAuto: false }];
      const autos = await tx.autoBid.findMany({ where: { auctionId: auction.id, active: true } });
      const proxy = resolveProxyBids(auction, { leaderId: actor.userId, leaderDealerId: actor.dealer?.id ?? null, price: input.amount }, autos);
      return commitBids(tx, auction, [...drafts, ...proxy.bids], proxy.state, proxy.exhausted, { actorId: actor.userId, ip: input.ip ?? null, now });
    },
    { timeout: 15000, maxWait: 10000 },
  );
  const actorId = input.actor!.userId;
  void flagRapidBidding(actorId).catch(() => {});
  void checkSellerLink(actorId, input.auctionId).catch(() => {});
  return {
    leading: outcome.auction.currentBidderId === actorId,
    currentBid: outcome.auction.currentBid,
    minNext: minimumNextBid(outcome.auction),
    endAt: outcome.auction.endAt,
    extended: outcome.extended,
    bidCount: outcome.auction.bidCount,
  };
}

export async function setAutoBid(input: { auctionId: string; actor: Actor | null; maxAmount: number; ip?: string | null }) {
  if (!Number.isInteger(input.maxAmount) || input.maxAmount <= 0) throw new AppError("VALIDATION", "Enter a valid maximum amount.");
  const outcome = await prisma.$transaction(
    async (tx) => {
      const auction = await lockAuction(tx, input.auctionId);
      const actor = await validateBidder(input.actor, auction);
      const now = new Date();
      assertLive(auction, now);
      const isLeader = auction.currentBidderId === actor.userId;
      const floor = isLeader ? (auction.currentBid ?? 0) + 1 : minimumNextBid(auction);
      if (input.maxAmount < floor)
        throw new AppError("BID_TOO_LOW", `Your maximum bid must be at least ${formatINR(isLeader ? (auction.currentBid ?? 0) + auction.bidIncrement : floor)}.`, { minNext: floor });
      const multiplier = await getSetting("bidding.maxBidMultiplier", tx);
      const ceiling = Math.max(auction.vehicleExpectedPrice, auction.reservePrice ?? 0, auction.startingBid) * multiplier;
      if (input.maxAmount > ceiling) throw new AppError("VALIDATION", `Maximum allowed is ${formatINR(ceiling)}.`);

      await tx.autoBid.upsert({
        where: { auctionId_userId: { auctionId: auction.id, userId: actor.userId } },
        create: { auctionId: auction.id, userId: actor.userId, dealerId: actor.dealer?.id ?? null, maxAmount: input.maxAmount },
        update: { maxAmount: input.maxAmount, active: true },
      });
      await audit({ userId: actor.userId, action: "autobid.set", entityType: "Auction", entityId: auction.id, ip: input.ip }, tx);
      const autos = await tx.autoBid.findMany({ where: { auctionId: auction.id, active: true } });
      const proxy = resolveProxyBids(
        auction,
        { leaderId: auction.currentBidderId, leaderDealerId: null, price: auction.currentBid },
        autos,
      );
      // Fill the leader's dealer id for any defending bids.
      if (auction.currentBidderId) {
        const lead = autos.find((a) => a.userId === auction.currentBidderId);
        for (const b of proxy.bids) if (b.userId === auction.currentBidderId && !b.dealerId) b.dealerId = lead?.dealerId ?? null;
        if (proxy.state.leaderId === auction.currentBidderId && !proxy.state.leaderDealerId) proxy.state.leaderDealerId = lead?.dealerId ?? null;
      }
      if (proxy.bids.length === 0) return { auction: await tx.auction.findUniqueOrThrow({ where: { id: auction.id } }), extended: false, bids: [], previousLeaderId: auction.currentBidderId };
      return commitBids(tx, auction, proxy.bids, proxy.state, proxy.exhausted, { actorId: actor.userId, ip: input.ip ?? null, now });
    },
    { timeout: 15000, maxWait: 10000 },
  );
  const uid = input.actor!.userId;
  return {
    leading: outcome.auction.currentBidderId === uid,
    currentBid: outcome.auction.currentBid,
    minNext: minimumNextBid(outcome.auction),
    endAt: outcome.auction.endAt,
    extended: outcome.extended,
    maxAmount: input.maxAmount,
  };
}

export async function cancelAutoBid(auctionId: string, actor: Actor) {
  await prisma.autoBid.updateMany({ where: { auctionId, userId: actor.userId }, data: { active: false } });
  await audit({ userId: actor.userId, action: "autobid.cancel", entityType: "Auction", entityId: auctionId });
}

/** Admin: cancel a bid (e.g. fraud). Recomputes the leader from remaining valid bids. */
export async function adminCancelBid(bidId: string, actor: Actor, reason: string) {
  if (!can(actor, "bids.manage")) throw forbidden();
  return prisma.$transaction(async (tx) => {
    const bid = await tx.bid.findUnique({ where: { id: bidId } });
    if (!bid) throw notFound("Bid not found.");
    const auction = await lockAuction(tx, bid.auctionId);
    if (auction.status !== "LIVE" && auction.status !== "SCHEDULED") throw conflict("Bids can only be cancelled while the auction is open.");
    await tx.bid.update({ where: { id: bidId }, data: { status: "CANCELLED" } });
    const top = await tx.bid.findFirst({ where: { auctionId: auction.id, status: "VALID" }, orderBy: [{ amount: "desc" }, { createdAt: "asc" }] });
    const after = await tx.auction.update({
      where: { id: auction.id },
      data: { currentBid: top?.amount ?? null, currentBidderId: top?.bidderId ?? null, bidCount: { decrement: 1 } },
    });
    await tx.vehicle.update({ where: { id: auction.vehicleId }, data: { currentBid: after.currentBid, bidCount: after.bidCount } });
    await audit({ userId: actor.userId, action: "bid.cancel", entityType: "Bid", entityId: bidId, before: { amount: bid.amount, bidderId: bid.bidderId }, after: { reason } }, tx);
    await notify(bid.bidderId, { type: "SYSTEM", title: "A bid was cancelled", body: `Your bid of ${formatINR(bid.amount)} on ${auction.vehicleTitle} was cancelled by AutoBidX. Reason: ${reason}`, link: `/auctions/${auction.id}` }, tx);
    await publish({ type: "auction.update", auctionId: auction.id, data: { reason: "bid_cancelled" } }, tx);
  }).then(async () => {
    const bid = await prisma.bid.findUnique({ where: { id: bidId }, select: { bidderId: true } });
    if (bid) await flagBidCancellations(bid.bidderId).catch(() => {});
  });
}

// ───────────────────────── Lifecycle ─────────────────────────

export async function createAuctionTx(
  tx: Tx,
  vehicle: { id: string; expectedPrice: number; reservePrice: number | null; minimumBid: number | null; bidIncrement: number | null; auctionStartAt: Date | null; auctionEndAt: Date | null; autoExtendSeconds: number | null; reserveVisible: boolean },
) {
  const cfg = await getSettings(["auction.defaultDurationHours", "auction.antiSnipeTriggerSeconds", "auction.antiSnipeExtendSeconds", "auction.maxExtensions"], tx);
  const now = new Date();
  const startAt = vehicle.auctionStartAt && vehicle.auctionStartAt > now ? vehicle.auctionStartAt : now;
  let endAt = vehicle.auctionEndAt && vehicle.auctionEndAt > startAt ? vehicle.auctionEndAt : new Date(startAt.getTime() + cfg["auction.defaultDurationHours"] * 3600_000);
  if (endAt <= now) endAt = new Date(now.getTime() + cfg["auction.defaultDurationHours"] * 3600_000);
  const startingBid = vehicle.minimumBid ?? Math.round(vehicle.expectedPrice * 0.8);
  const auction = await tx.auction.create({
    data: {
      vehicleId: vehicle.id,
      status: startAt <= now ? "LIVE" : "SCHEDULED",
      startAt,
      endAt,
      originalEndAt: endAt,
      startingBid,
      reservePrice: vehicle.reservePrice,
      reserveVisible: vehicle.reserveVisible,
      bidIncrement: vehicle.bidIncrement ?? (await incrementFor(startingBid, tx)),
      extendTriggerSec: cfg["auction.antiSnipeTriggerSeconds"],
      extendBySec: vehicle.autoExtendSeconds ?? cfg["auction.antiSnipeExtendSeconds"],
      maxExtensions: cfg["auction.maxExtensions"],
    },
  });
  await tx.vehicle.update({
    where: { id: vehicle.id },
    data: {
      status: auction.status === "LIVE" ? "AUCTION_LIVE" : "PUBLISHED",
      liveAuctionId: auction.id,
      auctionStartAt: auction.startAt,
      auctionEndAt: auction.endAt,
      currentBid: null,
      bidCount: 0,
    },
  });
  return auction;
}

export async function startDueAuctions() {
  const due = await prisma.auction.findMany({ where: { status: "SCHEDULED", startAt: { lte: new Date() } }, select: { id: true }, take: 200 });
  for (const { id } of due) {
    await prisma.$transaction(async (tx) => {
      const a = await lockAuction(tx, id);
      if (a.status !== "SCHEDULED") return;
      await tx.auction.update({ where: { id }, data: { status: "LIVE" } });
      await tx.vehicle.update({ where: { id: a.vehicleId }, data: { status: "AUCTION_LIVE" } });
      await audit({ action: "auction.start", entityType: "Auction", entityId: id }, tx);
      await publish({ type: "auction.update", auctionId: id, data: { status: "LIVE" } }, tx);
    });
  }
  return due.length;
}

/**
 * Closes an auction whose end time has passed:
 * 1. highest valid bidder → 2. reserve check → 3. WON / RESERVE_NOT_MET / NO_BIDS →
 * 4. order for the winner → 5/6. notify winner & seller → 7. no further bids (status ENDED).
 */
export async function closeAuction(auctionId: string, opts: { force?: boolean; actorId?: string } = {}) {
  return prisma.$transaction(
    async (tx) => {
      const a = await lockAuction(tx, auctionId);
      if (a.status !== "LIVE" && a.status !== "SCHEDULED") return a;
      const now = new Date();
      if (!opts.force && a.endAt > now) return a; // extended meanwhile

      const top = await tx.bid.findFirst({ where: { auctionId, status: "VALID" }, orderBy: [{ amount: "desc" }, { createdAt: "asc" }] });
      const reserveMet = top != null && (a.reservePrice == null || top.amount >= a.reservePrice);
      const result = !top ? "NO_BIDS" : reserveMet ? "WON" : "RESERVE_NOT_MET";

      const closed = await tx.auction.update({
        where: { id: auctionId },
        data: { status: "ENDED", result, closedAt: now, winnerId: result === "WON" ? top!.bidderId : null, endAt: opts.force && a.endAt > now ? now : a.endAt },
      });
      await audit({ userId: opts.actorId ?? null, action: "auction.close", entityType: "Auction", entityId: auctionId, after: { result, topBid: top?.amount ?? null } }, tx);

      const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: a.vehicleId } });
      if (result === "WON") {
        await createOrderTx(tx, { vehicle, source: "AUCTION", buyerId: top!.bidderId, buyerDealerId: top!.dealerId, price: top!.amount, auctionId, actorId: opts.actorId ?? null });
        await notify(top!.bidderId, { type: "AUCTION_WON", title: "Congratulations — you won!", body: `You won ${vehicle.title} at ${formatINR(top!.amount)}.`, link: `/auctions/${auctionId}` }, tx);
        const losers = await tx.bid.findMany({ where: { auctionId, status: "VALID", bidderId: { not: top!.bidderId } }, distinct: ["bidderId"], select: { bidderId: true } });
        if (losers.length)
          await notify(losers.map((l) => l.bidderId), { type: "AUCTION_UNSOLD", title: "Auction ended", body: `${vehicle.title} was won by another bidder at ${formatINR(top!.amount)}.`, link: `/auctions/${auctionId}` }, tx);
      } else {
        await tx.vehicle.update({ where: { id: vehicle.id }, data: { status: "AUCTION_ENDED" } });
        await notifyDealer(vehicle.dealerId, {
          type: "AUCTION_UNSOLD",
          title: result === "NO_BIDS" ? "Auction ended with no bids" : "Reserve not met",
          body:
            result === "NO_BIDS"
              ? `${vehicle.title} received no bids. You can relist it.`
              : `${vehicle.title} ended at ${formatINR(top!.amount)}, below your reserve. You can accept the highest bid or relist.`,
          link: `/dashboard/auctions`,
        }, tx);
        if (top) await notify(top.bidderId, { type: "AUCTION_UNSOLD", title: "Reserve not met", body: `${vehicle.title} ended below the seller's reserve. The seller may still accept your bid.`, link: `/auctions/${auctionId}` }, tx);
      }
      await publish({ type: "auction.closed", auctionId, data: { result, currentBid: closed.currentBid, winnerAlias: closed.winnerId ? bidderAlias(auctionId, closed.winnerId) : null } }, tx);
      return closed;
    },
    { timeout: 20000 },
  );
}

export async function closeDueAuctions() {
  const due = await prisma.auction.findMany({ where: { status: "LIVE", endAt: { lte: new Date() } }, select: { id: true }, take: 200, orderBy: { endAt: "asc" } });
  for (const { id } of due) {
    try {
      await closeAuction(id);
    } catch (e) {
      console.error("[auction] close failed", id, e);
    }
  }
  return due.length;
}

/** Seller workflow when reserve was not met: accept the highest bid within the configured window. */
export async function acceptHighestBid(auctionId: string, actor: Actor, ip?: string | null) {
  return prisma.$transaction(async (tx) => {
    const a = await lockAuction(tx, auctionId);
    if (!actor.dealer || actor.dealer.id !== a.vehicleDealerId) throw forbidden();
    if (a.status !== "ENDED" || a.result !== "RESERVE_NOT_MET") throw conflict("Only auctions that ended below reserve can be accepted.");
    const hours = await getSetting("auction.reserveNotMetAcceptHours", tx);
    if (a.closedAt && Date.now() - a.closedAt.getTime() > hours * 3600_000) throw conflict("The acceptance window has expired. Please relist the vehicle.");
    const top = await tx.bid.findFirst({ where: { auctionId, status: "VALID" }, orderBy: [{ amount: "desc" }, { createdAt: "asc" }] });
    if (!top) throw conflict("No bids to accept.");
    await tx.auction.update({ where: { id: auctionId }, data: { result: "WON", winnerId: top.bidderId } });
    const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: a.vehicleId } });
    const order = await createOrderTx(tx, { vehicle, source: "AUCTION", buyerId: top.bidderId, buyerDealerId: top.dealerId, price: top.amount, auctionId, actorId: actor.userId, ip });
    await notify(top.bidderId, { type: "AUCTION_WON", title: "The seller accepted your bid!", body: `${vehicle.title} at ${formatINR(top.amount)}.`, link: `/dashboard/orders/${order.id}` }, tx);
    await audit({ userId: actor.userId, action: "auction.accept_below_reserve", entityType: "Auction", entityId: auctionId, after: { amount: top.amount }, ip }, tx);
    return order;
  });
}

/** Relist an ended/unsold vehicle as a fresh auction. */
export async function relistAuction(vehicleId: string, actor: Actor, opts: { durationHours?: number; reservePrice?: number | null; startingBid?: number }) {
  return prisma.$transaction(async (tx) => {
    const v = await tx.vehicle.findUnique({ where: { id: vehicleId } });
    if (!v) throw notFound();
    if (!actor.dealer || v.dealerId !== actor.dealer.id) throw forbidden();
    if (!["AUCTION_ENDED", "PUBLISHED"].includes(v.status)) throw conflict("This vehicle can't be relisted right now.");
    const open = await tx.auction.findFirst({ where: { vehicleId, status: { in: ["LIVE", "SCHEDULED"] } } });
    if (open) throw conflict("An auction is already running for this vehicle.");
    const hours = opts.durationHours ?? (await getSetting("auction.defaultDurationHours", tx));
    const auction = await createAuctionTx(tx, {
      ...v,
      reservePrice: opts.reservePrice === undefined ? v.reservePrice : opts.reservePrice,
      minimumBid: opts.startingBid ?? v.minimumBid,
      auctionStartAt: new Date(),
      auctionEndAt: new Date(Date.now() + hours * 3600_000),
    });
    await tx.vehicle.update({ where: { id: vehicleId }, data: { auctionEnabled: true } });
    await audit({ userId: actor.userId, action: "auction.relist", entityType: "Auction", entityId: auction.id }, tx);
    return auction;
  });
}

/** Admin: start a scheduled auction now. */
export async function adminStartAuction(auctionId: string, actor: Actor) {
  if (!can(actor, "auctions.manage")) throw forbidden();
  return prisma.$transaction(async (tx) => {
    const a = await lockAuction(tx, auctionId);
    if (a.status !== "SCHEDULED") throw conflict("Only scheduled auctions can be started.");
    const now = new Date();
    const duration = a.endAt.getTime() - a.startAt.getTime();
    const endAt = a.endAt > now ? a.endAt : new Date(now.getTime() + duration);
    await tx.auction.update({ where: { id: auctionId }, data: { status: "LIVE", startAt: now, endAt, originalEndAt: endAt } });
    await tx.vehicle.update({ where: { id: a.vehicleId }, data: { status: "AUCTION_LIVE", auctionStartAt: now, auctionEndAt: endAt } });
    await audit({ userId: actor.userId, action: "auction.admin_start", entityType: "Auction", entityId: auctionId }, tx);
    await publish({ type: "auction.update", auctionId, data: { status: "LIVE" } }, tx);
  });
}

/** Admin: stop (cancel) an auction. No order is created; bidders are notified. */
export async function adminCancelAuction(auctionId: string, actor: Actor, reason: string) {
  if (!can(actor, "auctions.manage")) throw forbidden();
  return prisma.$transaction(async (tx) => {
    const a = await lockAuction(tx, auctionId);
    if (a.status === "ENDED" || a.status === "CANCELLED") throw conflict("Auction is already closed.");
    await tx.auction.update({ where: { id: auctionId }, data: { status: "CANCELLED", result: "CANCELLED", closedAt: new Date() } });
    await tx.autoBid.updateMany({ where: { auctionId }, data: { active: false } });
    await tx.vehicle.update({ where: { id: a.vehicleId }, data: { status: "PUBLISHED", liveAuctionId: null, currentBid: null, bidCount: 0, auctionEnabled: false } });
    await audit({ userId: actor.userId, action: "auction.admin_cancel", entityType: "Auction", entityId: auctionId, after: { reason } }, tx);
    const bidders = await tx.bid.findMany({ where: { auctionId }, distinct: ["bidderId"], select: { bidderId: true } });
    if (bidders.length)
      await notify(bidders.map((b) => b.bidderId), { type: "SYSTEM", title: "Auction cancelled", body: `The auction for ${a.vehicleTitle} was cancelled by AutoBidX. Reason: ${reason}`, link: `/auctions/${auctionId}` }, tx);
    await notifyDealer(a.vehicleDealerId, { type: "SYSTEM", title: "Auction cancelled by admin", body: `${a.vehicleTitle}: ${reason}`, link: "/dashboard/auctions" }, tx);
    await publish({ type: "auction.closed", auctionId, data: { result: "CANCELLED" } }, tx);
  });
}

/** Admin: end an auction immediately and settle it normally. */
export async function adminEndAuctionNow(auctionId: string, actor: Actor) {
  if (!can(actor, "auctions.manage")) throw forbidden();
  return closeAuction(auctionId, { force: true, actorId: actor.userId });
}

// ───────────────────────── Read models ─────────────────────────

export async function auctionSnapshot(auctionId: string, viewerId?: string | null) {
  const a = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { bids: { where: { status: "VALID" }, orderBy: [{ createdAt: "desc" }], take: 25 } },
  });
  if (!a) return null;
  const myAuto = viewerId ? await prisma.autoBid.findUnique({ where: { auctionId_userId: { auctionId, userId: viewerId } } }) : null;
  const now = new Date();
  const status = effectiveStatus(a, now);
  return {
    id: a.id,
    status,
    result: a.result,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
    serverTime: now.toISOString(),
    startingBid: a.startingBid,
    currentBid: a.currentBid,
    minNext: minimumNextBid(a),
    bidIncrement: a.bidIncrement,
    bidCount: a.bidCount,
    bidderCount: a.bidderCount,
    extensionCount: a.extensionCount,
    extendTriggerSec: a.extendTriggerSec,
    extendBySec: a.extendBySec,
    reserveVisible: a.reserveVisible,
    reservePrice: a.reserveVisible ? a.reservePrice : null,
    hasReserve: a.reservePrice != null,
    reserveMet: a.reservePrice == null ? true : (a.currentBid ?? 0) >= a.reservePrice,
    leaderAlias: a.currentBidderId ? bidderAlias(a.id, a.currentBidderId) : null,
    viewer: viewerId
      ? {
          isLeader: a.currentBidderId === viewerId,
          isWinner: a.winnerId === viewerId,
          hasBid: a.bids.some((b) => b.bidderId === viewerId),
          autoBidMax: myAuto?.active ? myAuto.maxAmount : null,
          alias: bidderAlias(a.id, viewerId),
        }
      : null,
    bids: a.bids.map((b) => ({
      id: b.id,
      amount: b.amount,
      isAuto: b.isAuto,
      at: b.createdAt.toISOString(),
      alias: bidderAlias(a.id, b.bidderId),
      mine: viewerId ? b.bidderId === viewerId : false,
    })),
  };
}

export type AuctionSnapshot = NonNullable<Awaited<ReturnType<typeof auctionSnapshot>>>;

// ───────────────────────── Scheduled jobs ─────────────────────────

/** Sends "auction ending soon" alerts to watchers and bidders once per auction. */
export async function sendEndingSoonAlerts() {
  const minutes = await getSetting("notifications.auctionEndingMinutes");
  const soon = new Date(Date.now() + minutes * 60_000);
  const auctions = await prisma.auction.findMany({
    where: { status: "LIVE", endAt: { lte: soon, gt: new Date() } },
    include: { vehicle: { select: { id: true, title: true } } },
    take: 100,
  });
  for (const a of auctions) {
    const already = await prisma.auditLog.findFirst({ where: { action: "auction.ending_alert", entityId: a.id } });
    if (already) continue;
    const watchers = await prisma.watchlist.findMany({ where: { vehicleId: a.vehicleId, notifyEnding: true }, select: { userId: true } });
    const bidders = await prisma.bid.findMany({ where: { auctionId: a.id }, distinct: ["bidderId"], select: { bidderId: true } });
    const ids = [...new Set([...watchers.map((w) => w.userId), ...bidders.map((b) => b.bidderId)])];
    await prisma.$transaction(async (tx) => {
      await audit({ action: "auction.ending_alert", entityType: "Auction", entityId: a.id }, tx);
      if (ids.length) await notify(ids, { type: "AUCTION_ENDING", title: "Auction ending soon", body: `${a.vehicle.title} ends in under ${minutes} minutes.`, link: `/auctions/${a.id}` }, tx);
    });
  }
}

registerJob("auctions.tick", async () => {
  await startDueAuctions();
  await closeDueAuctions();
});
registerJob("auctions.endingAlerts", async () => {
  await sendEndingSoonAlerts();
});
