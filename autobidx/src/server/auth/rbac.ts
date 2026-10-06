import { prisma } from "@/lib/db";
import { AppError, forbidden, notVerified, unauthenticated } from "@/lib/errors";
import type { DealerRole, DealerStatus, UserStatus, KycStatus } from "@prisma/client";
import type { Permission } from "./permissions";
import { getSetting } from "../settings";

export type ActorDealer = {
  id: string;
  name: string;
  slug: string;
  status: DealerStatus;
  role: DealerRole;
  canBid: boolean;
  canList: boolean;
  canBuy: boolean;
  canSell: boolean;
};

export type Actor = {
  userId: string;
  sessionId: string;
  name: string;
  email: string;
  phone: string;
  role: string; // role key
  status: UserStatus;
  kycStatus: KycStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  permissions: Set<string>;
  dealer: ActorDealer | null;
};

export async function buildActor(userId: string, sessionId: string): Promise<Actor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      dealerMemberships: { where: { active: true }, include: { dealer: true }, take: 1, orderBy: { createdAt: "asc" } },
    },
  });
  if (!user) return null;
  const m = user.dealerMemberships[0];
  return {
    userId: user.id,
    sessionId,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role.key,
    status: user.status,
    kycStatus: user.kycStatus,
    emailVerified: !!user.emailVerifiedAt,
    phoneVerified: !!user.phoneVerifiedAt,
    permissions: new Set(user.role.enabled ? user.role.permissions.map((p) => p.permission.key) : []),
    dealer: m
      ? {
          id: m.dealer.id,
          name: m.dealer.name,
          slug: m.dealer.slug,
          status: m.dealer.status,
          role: m.role,
          canBid: m.canBid,
          canList: m.canList,
          canBuy: m.dealer.canBuy,
          canSell: m.dealer.canSell,
        }
      : null,
  };
}

export const can = (actor: Actor | null | undefined, perm: Permission) => !!actor?.permissions.has(perm);
export const isAdmin = (actor: Actor | null | undefined) => can(actor, "admin.access");

export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw unauthenticated();
  return actor;
}

export function requirePermission(actor: Actor | null, perm: Permission): Actor {
  const a = requireActor(actor);
  if (!a.permissions.has(perm)) throw forbidden();
  return a;
}

/** Seller-side guard: verified dealer, member allowed to list. */
export function requireSeller(actor: Actor | null): Actor & { dealer: ActorDealer } {
  const a = requirePermission(actor, "marketplace.sell");
  if (!a.dealer) throw forbidden("A dealership profile is required to sell vehicles.");
  if (!a.dealer.canList) throw forbidden("Your dealership role does not allow listing vehicles.");
  if (!a.dealer.canSell) throw forbidden("Selling is disabled for your dealership.");
  if (a.dealer.status === "SUSPENDED" || a.dealer.status === "BLOCKED")
    throw forbidden("Your dealership is suspended. Contact support.");
  return a as Actor & { dealer: ActorDealer };
}

/** Seller-side guard for actions that require full verification (publishing, accepting offers). */
export function requireVerifiedSeller(actor: Actor | null) {
  const a = requireSeller(actor);
  if (a.dealer.status !== "VERIFIED") throw notVerified();
  return a;
}

/**
 * Buyer guard. Only VERIFIED dealers (or verified individual buyers when the feature is enabled)
 * may bid, make offers or buy.
 */
export async function requireVerifiedBuyer(actor: Actor | null): Promise<Actor> {
  const a = requirePermission(actor, "marketplace.buy");
  if (a.dealer) {
    if (a.dealer.status !== "VERIFIED") throw notVerified();
    if (!a.dealer.canBuy) throw forbidden("Buying is disabled for your dealership.");
    if (!a.dealer.canBid) throw forbidden("Your dealership role does not allow bidding or buying.");
    return a;
  }
  if (a.role === "INDIVIDUAL_BUYER") {
    if (!(await getSetting("features.individualBuyers")))
      throw new AppError("FORBIDDEN", "Individual buyer accounts are not enabled yet.");
    if (a.kycStatus !== "APPROVED") throw notVerified();
    return a;
  }
  throw forbidden();
}

/** Owner/manager of the dealership (team & bank settings). */
export function requireDealerManager(actor: Actor | null) {
  const a = requireActor(actor);
  if (!a.dealer || (a.dealer.role !== "OWNER" && a.dealer.role !== "MANAGER")) throw forbidden("Only dealership owners or managers can do this.");
  return a as Actor & { dealer: ActorDealer };
}

/** Human-readable reason this actor can't bid/buy/offer on a seller's vehicle, or null if allowed. */
export function buyBlockReason(actor: Actor | null, sellerDealerId: string, individualBuyersEnabled = false): string | null {
  if (!actor) return null; // anonymous users are sent to sign in instead
  if (actor.dealer && actor.dealer.id === sellerDealerId) return "This is your own listing — you can't bid on or buy it.";
  if (!actor.permissions.has("marketplace.buy")) return "Admin accounts can't participate in auctions.";
  if (actor.dealer) {
    if (actor.dealer.status === "SUSPENDED" || actor.dealer.status === "BLOCKED") return "Your dealership is suspended. Contact support.";
    if (actor.dealer.status !== "VERIFIED") return "Your account is not verified. Complete KYC to bid or buy.";
    if (!actor.dealer.canBuy) return "Buying is disabled for your dealership.";
    if (!actor.dealer.canBid) return "Your role at the dealership doesn't allow bidding or buying.";
    return null;
  }
  if (actor.role === "INDIVIDUAL_BUYER") {
    if (!individualBuyersEnabled) return "Individual buyer accounts are not enabled yet.";
    if (actor.kycStatus !== "APPROVED") return "Your account is not verified. Complete KYC to bid or buy.";
    return null;
  }
  return "Your account can't buy vehicles.";
}
