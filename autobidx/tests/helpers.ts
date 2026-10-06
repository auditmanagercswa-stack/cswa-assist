import { prisma } from "@/lib/db";
import { shortCode } from "@/lib/ids";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "@/server/auth/permissions";
import { buildActor, type Actor } from "@/server/auth/rbac";
import { hashPassword } from "@/server/auth/password";
import { invalidateSettings } from "@/server/settings";
import { invalidateFeeCache } from "@/server/services/fees";
import type { DealerStatus, Prisma } from "@prisma/client";

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  // The app runs some post-commit checks fire-and-forget (fraud heuristics); they may still hold
  // row locks from the previous test, so retry the truncate on deadlock/lock timeout.
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
      break;
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
  }
  invalidateSettings();
  invalidateFeeCache();
}

export type World = Awaited<ReturnType<typeof seedWorld>>;

/** Minimal reference data: roles, plans, fees (matching production defaults), location, catalog. */
export async function seedWorld() {
  await resetDb();
  const perms = new Map<string, string>();
  for (const [key, description] of Object.entries(PERMISSIONS)) perms.set(key, (await prisma.permission.create({ data: { key, description } })).id);
  for (const [key, list] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    await prisma.role.create({ data: { key, name: key, permissions: { create: list.map((p) => ({ permissionId: perms.get(p)! })) } } });
  }
  const free = await prisma.subscriptionPlan.create({ data: { code: "FREE", name: "Free", priceMonthly: 0, listingLimit: 10, features: [] } });
  const pro = await prisma.subscriptionPlan.create({ data: { code: "PRO", name: "Pro", priceMonthly: 2999, listingLimit: 50, analytics: true, features: [] } });
  await prisma.fee.create({ data: { code: "BUYER_PLATFORM_FEE", name: "Buyer platform fee", payer: "BUYER", trigger: "TRANSACTION", sortOrder: 1, rules: { create: [{ calcType: "PERCENT", rateBps: 50, minAmount: 500, maxAmount: 25000, gstApplicable: true }] } } });
  await prisma.fee.create({ data: { code: "PROCESSING_FEE", name: "Processing fee", payer: "BUYER", trigger: "TRANSACTION", sortOrder: 2, rules: { create: [{ calcType: "FIXED", fixedAmount: 1000, gstApplicable: true }] } } });
  await prisma.fee.create({ data: { code: "SELLER_TRANSACTION_FEE", name: "Seller platform fee", payer: "SELLER", trigger: "TRANSACTION", sortOrder: 3, rules: { create: [{ calcType: "PERCENT", rateBps: 100, minAmount: 1000, gstApplicable: false }, { calcType: "PERCENT", rateBps: 75, minAmount: 1000, gstApplicable: false, planId: pro.id }] } } });
  await prisma.fee.create({ data: { code: "LISTING_FEE", name: "Listing fee", payer: "SELLER", trigger: "LISTING", sortOrder: 4, rules: { create: [{ calcType: "FIXED", fixedAmount: 499, gstApplicable: true }, { calcType: "FIXED", fixedAmount: 0, planId: pro.id }] } } });
  await prisma.fee.create({ data: { code: "FEATURED_LISTING", name: "Featured listing", payer: "SELLER", trigger: "FEATURED", sortOrder: 6, rules: { create: [{ calcType: "FIXED", fixedAmount: 999, gstApplicable: true }] } } });
  const state = await prisma.state.create({ data: { name: "Kerala", code: "KL", slug: "kerala", priority: 100 } });
  const district = await prisma.district.create({ data: { stateId: state.id, name: "Ernakulam", slug: "ernakulam" } });
  const city = await prisma.city.create({ data: { districtId: district.id, name: "Kochi", slug: "kochi", pincode: "682001" } });
  const make = await prisma.make.create({ data: { name: "Hyundai", slug: "hyundai" } });
  const model = await prisma.model.create({ data: { makeId: make.id, name: "Creta", slug: "creta", bodyType: "SUV" } });
  const variant = await prisma.variant.create({ data: { modelId: model.id, name: "SX", fuel: "PETROL", transmission: "MANUAL" } });
  return { free, pro, state, district, city, make, model, variant };
}

let seq = 0;
export async function makeDealer(w: World, opts: { status?: DealerStatus; plan?: "FREE" | "PRO"; role?: "OWNER" | "STAFF"; canBid?: boolean } = {}) {
  const n = ++seq; // capture before any await — fixtures are created concurrently in some tests
  const role = await prisma.role.findUniqueOrThrow({ where: { key: "DEALER" } });
  const user = await prisma.user.create({
    data: { name: `Dealer Owner ${n}`, email: `d${n}-${shortCode(4)}@test.in`, phone: `9${String(n).padStart(9, "0")}`, passwordHash: await hashPassword("Passw0rd!"), roleId: role.id },
  });
  const dealer = await prisma.dealer.create({
    data: {
      slug: `dealer-${n}-${shortCode(4)}`,
      name: `Test Motors ${n}`,
      businessType: "PROPRIETORSHIP",
      pan: "ABCDE1234F",
      addressLine: "1 MG Road",
      stateId: w.state.id,
      districtId: w.district.id,
      pincode: "682001",
      status: opts.status ?? "VERIFIED",
      members: { create: { userId: user.id, role: opts.role ?? "OWNER", canBid: opts.canBid ?? true } },
      subscriptions: { create: { planId: opts.plan === "PRO" ? w.pro.id : w.free.id, status: "ACTIVE" } },
    },
  });
  return { user, dealer, actor: await actorFor(user.id) };
}

export async function makeAdmin(roleKey: "ADMIN" | "SUPER_ADMIN" = "ADMIN") {
  const n = ++seq;
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  const user = await prisma.user.create({ data: { name: `Admin ${n}`, email: `admin${n}-${shortCode(4)}@test.in`, phone: `8${String(n).padStart(9, "0")}`, passwordHash: await hashPassword("Passw0rd!"), roleId: role.id } });
  return { user, actor: await actorFor(user.id) };
}

export async function actorFor(userId: string): Promise<Actor> {
  const s = await prisma.session.create({ data: { userId, expiresAt: new Date(Date.now() + 86400_000) } });
  return (await buildActor(userId, s.id))!;
}

export async function makeVehicle(w: World, dealerId: string, data: Partial<Prisma.VehicleUncheckedCreateInput> = {}) {
  return prisma.vehicle.create({
    data: {
      code: shortCode(6),
      dealerId,
      makeId: w.make.id,
      modelId: w.model.id,
      variantId: w.variant.id,
      variantName: "SX",
      title: "2021 Hyundai Creta SX",
      bodyType: "SUV",
      year: 2021,
      registrationYear: 2021,
      registrationNumber: "KL07CX1234",
      fuel: "PETROL",
      transmission: "MANUAL",
      kmDriven: 30000,
      color: "White",
      stateId: w.state.id,
      districtId: w.district.id,
      cityId: w.city.id,
      pincode: "682001",
      expectedPrice: 1000000,
      status: "PUBLISHED",
      publishedAt: new Date(),
      images: { create: [{ url: "/media/seed/x.webp", sortOrder: 0 }] },
      ...data,
    },
  });
}

export async function makeLiveAuction(vehicleId: string, opts: { startingBid?: number; increment?: number; reserve?: number | null; endInMs?: number; startInMs?: number } = {}) {
  const now = Date.now();
  const startAt = new Date(now + (opts.startInMs ?? -3600_000));
  const endAt = new Date(now + (opts.endInMs ?? 3600_000));
  const a = await prisma.auction.create({
    data: {
      vehicleId,
      status: startAt.getTime() > now ? "SCHEDULED" : "LIVE",
      startAt,
      endAt,
      originalEndAt: endAt,
      startingBid: opts.startingBid ?? 500000,
      bidIncrement: opts.increment ?? 10000,
      reservePrice: opts.reserve === undefined ? null : opts.reserve,
      extendTriggerSec: 120,
      extendBySec: 120,
    },
  });
  await prisma.vehicle.update({ where: { id: vehicleId }, data: { status: a.status === "LIVE" ? "AUCTION_LIVE" : "PUBLISHED", liveAuctionId: a.id, auctionEndAt: endAt } });
  return a;
}

export async function expectAppError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code !== code) throw new Error(`Expected AppError ${code}, got ${err.code ?? "unknown"}: ${err.message}`);
    return err;
  }
  throw new Error(`Expected AppError ${code}, but the call succeeded`);
}
