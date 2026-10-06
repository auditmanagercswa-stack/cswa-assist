import { prisma, type Db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { getSetting } from "../settings";
import { audit } from "../audit";
import { notifyAdmins } from "../notifications/notify";
import { forbidden, notFound } from "@/lib/errors";
import type { Actor } from "../auth/rbac";
import { can } from "../auth/rbac";

/**
 * Heuristic fraud signals. These ONLY raise flags for human review — nothing here bans or
 * suspends an account automatically.
 */
export type FraudType =
  | "MULTI_ACCOUNT"
  | "SHILL_BIDDING"
  | "SELF_BID_ATTEMPT"
  | "RAPID_BIDDING"
  | "FAILED_PAYMENTS"
  | "BID_CANCELLATIONS"
  | "SUSPENDED_REREGISTER";

async function raise(
  type: FraudType,
  severity: 1 | 2 | 3,
  target: { userId?: string | null; dealerId?: string | null },
  details: Record<string, unknown>,
  db: Db = prisma,
) {
  // De-duplicate: one open flag per type+subject per 24h.
  const recent = await db.fraudFlag.findFirst({
    where: {
      type,
      userId: target.userId ?? undefined,
      dealerId: target.userId ? undefined : (target.dealerId ?? undefined),
      status: "OPEN",
      createdAt: { gt: new Date(Date.now() - 86400_000) },
    },
  });
  if (recent) return recent;
  const flag = await db.fraudFlag.create({
    data: { type, severity, userId: target.userId ?? null, dealerId: target.dealerId ?? null, details: details as Prisma.InputJsonValue },
  });
  if (severity >= 2) {
    await notifyAdmins({ type: "SYSTEM", title: `Fraud signal: ${type.replace(/_/g, " ").toLowerCase()}`, body: "A new account was flagged for review.", link: "/admin/reports?tab=fraud" }, db);
  }
  return flag;
}

export async function flagShillAttempt(userId: string, dealerId: string, auctionId: string) {
  await raise("SELF_BID_ATTEMPT", 2, { userId, dealerId }, { auctionId, note: "Seller-side account attempted to bid on own vehicle (blocked)." });
}

export async function flagRapidBidding(userId: string) {
  const [count, windowSec] = await Promise.all([getSetting("fraud.rapidBidCount"), getSetting("fraud.rapidBidWindowSeconds")]);
  const n = await prisma.bid.count({ where: { bidderId: userId, isAuto: false, createdAt: { gt: new Date(Date.now() - windowSec * 1000) } } });
  if (n >= count) await raise("RAPID_BIDDING", 1, { userId }, { bidsInWindow: n, windowSec });
}

/** Bidder shares a signup IP / device fingerprint with a member of the selling dealership. */
export async function checkSellerLink(userId: string, auctionId: string) {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId }, select: { vehicle: { select: { dealerId: true } } } });
  const bidder = await prisma.user.findUnique({ where: { id: userId }, select: { signupIp: true, signupFingerprint: true } });
  if (!auction || !bidder) return;
  const ors: Prisma.UserWhereInput[] = [];
  if (bidder.signupFingerprint) ors.push({ signupFingerprint: bidder.signupFingerprint });
  if (bidder.signupIp) ors.push({ signupIp: bidder.signupIp });
  if (!ors.length) return;
  const linked = await prisma.dealerUser.findFirst({
    where: { dealerId: auction.vehicle.dealerId, user: { OR: ors, id: { not: userId } } },
  });
  if (linked) await raise("SHILL_BIDDING", 3, { userId }, { auctionId, sellerDealerId: auction.vehicle.dealerId, signal: "shared signup ip/device with seller" });
}

export async function flagFailedPayments(userId: string) {
  const threshold = await getSetting("fraud.failedPaymentThreshold");
  const n = await prisma.payment.count({ where: { userId, status: "FAILED", createdAt: { gt: new Date(Date.now() - 30 * 86400_000) } } });
  if (n >= threshold) await raise("FAILED_PAYMENTS", 2, { userId }, { failedPayments30d: n });
}

export async function flagBidCancellations(userId: string) {
  const threshold = await getSetting("fraud.bidCancellationThreshold");
  const n = await prisma.bid.count({ where: { bidderId: userId, status: "CANCELLED", createdAt: { gt: new Date(Date.now() - 30 * 86400_000) } } });
  if (n >= threshold) await raise("BID_CANCELLATIONS", 2, { userId }, { cancelledBids30d: n });
}

/** Registration-time checks: suspended identity re-registering, many accounts from one device. */
export async function registrationChecks(input: { userId: string; dealerId?: string | null; pan?: string | null; gstin?: string | null; phone: string; ip: string | null; fingerprint: string | null }) {
  const blockedDealer = await prisma.dealer.findFirst({
    where: {
      id: input.dealerId ? { not: input.dealerId } : undefined,
      status: { in: ["SUSPENDED", "BLOCKED"] },
      OR: [input.pan ? { pan: input.pan } : undefined, input.gstin ? { gstin: input.gstin } : undefined].filter(Boolean) as Prisma.DealerWhereInput[],
    },
  });
  if (blockedDealer && (input.pan || input.gstin))
    await raise("SUSPENDED_REREGISTER", 3, { userId: input.userId, dealerId: input.dealerId }, { matchedDealerId: blockedDealer.id, matchedOn: blockedDealer.pan === input.pan ? "PAN" : "GSTIN" });

  if (input.fingerprint && input.ip) {
    const n = await prisma.user.count({ where: { signupFingerprint: input.fingerprint, signupIp: input.ip, createdAt: { gt: new Date(Date.now() - 7 * 86400_000) } } });
    if (n >= 3) await raise("MULTI_ACCOUNT", 2, { userId: input.userId }, { accountsFromSameDevice7d: n });
  }
}

export async function reviewFlag(flagId: string, actor: Actor, status: "REVIEWED" | "DISMISSED" | "ACTIONED", note: string) {
  if (!can(actor, "fraud.manage")) throw forbidden();
  const flag = await prisma.fraudFlag.findUnique({ where: { id: flagId } });
  if (!flag) throw notFound();
  await prisma.$transaction(async (tx) => {
    await tx.fraudFlag.update({ where: { id: flagId }, data: { status, reviewNote: note, reviewedById: actor.userId } });
    await audit({ userId: actor.userId, action: "fraud.review", entityType: "FraudFlag", entityId: flagId, before: { status: flag.status }, after: { status, note } }, tx);
  });
}
