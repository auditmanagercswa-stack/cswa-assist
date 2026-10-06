import { prisma, type Tx } from "@/lib/db";
import { AppError, conflict, forbidden, notFound } from "@/lib/errors";
import { shortCode } from "@/lib/ids";
import type { VehicleInput, VehicleSearch } from "@/lib/validation";
import type { MediaKind, Prisma, Vehicle, VehicleDocType, VehicleStatus } from "@prisma/client";
import type { Actor } from "../auth/rbac";
import { can, requireSeller, requireVerifiedSeller } from "../auth/rbac";
import { audit, diff } from "../audit";
import { notifyDealer } from "../notifications/notify";
import { getSetting } from "../settings";
import { createAuctionTx } from "./auctions";
import { createListingChargeTx } from "./payments";
import { activePlanId } from "./fees";
import { textFilter } from "../search";

export const PUBLIC_STATUSES: VehicleStatus[] = ["PUBLISHED", "AUCTION_LIVE"];
export const VIEWABLE_STATUSES: VehicleStatus[] = ["PUBLISHED", "AUCTION_LIVE", "AUCTION_ENDED", "RESERVED", "SOLD"];
const ACTIVE_LISTING: VehicleStatus[] = ["PENDING_APPROVAL", "PUBLISHED", "AUCTION_LIVE", "AUCTION_ENDED", "RESERVED"];

/** Fields safe for public listing cards (no reg number / VIN / reserve / margin). */
export const cardSelect = {
  id: true,
  code: true,
  title: true,
  variantName: true,
  year: true,
  kmDriven: true,
  fuel: true,
  transmission: true,
  bodyType: true,
  owners: true,
  cityName: true,
  expectedPrice: true,
  buyNowPrice: true,
  minimumBid: true,
  buyNowEnabled: true,
  auctionEnabled: true,
  status: true,
  featuredUntil: true,
  inspectionScore: true,
  inspectionVerified: true,
  currentBid: true,
  bidCount: true,
  auctionEndAt: true,
  auctionStartAt: true,
  liveAuctionId: true,
  publishedAt: true,
  make: { select: { name: true, slug: true } },
  model: { select: { name: true, slug: true } },
  district: { select: { name: true } },
  state: { select: { name: true, code: true } },
  dealer: { select: { name: true, slug: true, status: true, ratingAvg: true } },
  images: { select: { url: true, thumbUrl: true, alt: true }, where: { kind: "PHOTO" as MediaKind }, orderBy: { sortOrder: "asc" as const }, take: 1 },
} satisfies Prisma.VehicleSelect;

export type VehicleCardData = Prisma.VehicleGetPayload<{ select: typeof cardSelect }>;

async function buildDerived(db: Tx | typeof prisma, input: VehicleInput) {
  const [make, model, variant, district, state, city] = await Promise.all([
    db.make.findUnique({ where: { id: input.makeId } }),
    db.model.findUnique({ where: { id: input.modelId } }),
    input.variantId ? db.variant.findUnique({ where: { id: input.variantId } }) : null,
    db.district.findUnique({ where: { id: input.districtId } }),
    db.state.findUnique({ where: { id: input.stateId } }),
    input.cityId ? db.city.findUnique({ where: { id: input.cityId } }) : null,
  ]);
  if (!make || !model || model.makeId !== make.id) throw new AppError("VALIDATION", "Select a valid make and model.", { fields: { modelId: "Select a valid model" } });
  if (input.variantId && (!variant || variant.modelId !== model.id)) throw new AppError("VALIDATION", "Select a valid variant.", { fields: { variantId: "Select a valid variant" } });
  if (!state || !district || district.stateId !== state.id) throw new AppError("VALIDATION", "Select a valid state and district.", { fields: { districtId: "Select a valid district" } });
  if (city && city.districtId !== district.id) throw new AppError("VALIDATION", "Select a valid city.", { fields: { cityId: "Select a valid city" } });
  const variantName = variant?.name ?? input.variantName ?? null;
  const cityName = city?.name ?? input.cityName ?? district.name;
  const title = `${input.year} ${make.name} ${model.name}${variantName ? " " + variantName : ""}`;
  const searchText = [make.name, model.name, variantName, cityName, district.name, state.name, input.color, input.fuel, input.transmission, model.bodyType, input.year]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return { title, variantName, cityName, bodyType: model.bodyType, searchText };
}

function toData(input: VehicleInput) {
  return {
    makeId: input.makeId,
    modelId: input.modelId,
    variantId: input.variantId || null,
    year: input.year,
    registrationYear: input.registrationYear,
    registrationNumber: input.registrationNumber || null,
    vin: input.vin || null,
    engineNumber: input.engineNumber || null,
    fuel: input.fuel,
    transmission: input.transmission,
    kmDriven: input.kmDriven,
    color: input.color,
    owners: input.owners,
    insuranceStatus: input.insuranceStatus,
    insuranceExpiry: input.insuranceExpiry,
    rcStatus: input.rcStatus,
    description: input.description || null,
    stateId: input.stateId,
    districtId: input.districtId,
    cityId: input.cityId || null,
    pincode: input.pincode,
    overallCondition: input.overallCondition,
    accidentHistory: input.accidentHistory,
    floodDamage: input.floodDamage,
    engineCondition: input.engineCondition,
    gearboxCondition: input.gearboxCondition,
    tyreCondition: input.tyreCondition,
    batteryCondition: input.batteryCondition,
    serviceHistory: input.serviceHistory,
    expectedPrice: input.expectedPrice,
    reservePrice: input.reservePrice,
    minimumBid: input.minimumBid,
    buyNowPrice: input.buyNowEnabled ? input.buyNowPrice : null,
    sellerMargin: input.sellerMargin,
    buyNowEnabled: input.buyNowEnabled,
    offersEnabled: input.offersEnabled,
    auctionEnabled: input.auctionEnabled,
    auctionStartAt: input.auctionEnabled ? input.auctionStartAt : null,
    auctionEndAt: input.auctionEnabled ? input.auctionEndAt : null,
    bidIncrement: input.bidIncrement,
    autoExtendSeconds: input.autoExtendSeconds,
    reserveVisible: input.reserveVisible,
  };
}

async function assertListingQuota(dealerId: string) {
  const planId = await activePlanId(dealerId);
  const plan = planId ? await prisma.subscriptionPlan.findUnique({ where: { id: planId } }) : null;
  if (plan?.listingLimit == null) return;
  const active = await prisma.vehicle.count({ where: { dealerId, status: { in: ACTIVE_LISTING } } });
  if (active >= plan.listingLimit)
    throw new AppError("FORBIDDEN", `Your ${plan.name} plan allows ${plan.listingLimit} active listings. Upgrade your plan to list more vehicles.`);
}

export async function createVehicle(actor: Actor | null, input: VehicleInput, ip?: string | null) {
  const seller = requireSeller(actor);
  const derived = await buildDerived(prisma, input);
  return prisma.$transaction(async (tx) => {
    const v = await tx.vehicle.create({
      data: { ...toData(input), ...derived, code: shortCode(6), dealerId: seller.dealer.id, createdById: seller.userId, status: "DRAFT" },
    });
    await audit({ userId: seller.userId, action: "vehicle.create", entityType: "Vehicle", entityId: v.id, after: { title: v.title, expectedPrice: v.expectedPrice }, ip }, tx);
    return v;
  });
}

async function loadOwned(actor: Actor, vehicleId: string, db: Tx | typeof prisma = prisma) {
  const v = await db.vehicle.findUnique({ where: { id: vehicleId } });
  if (!v) throw notFound("Vehicle not found.");
  if (!can(actor, "vehicles.manage") && v.dealerId !== actor.dealer?.id) throw notFound("Vehicle not found.");
  return v;
}

export async function updateVehicle(actor: Actor | null, vehicleId: string, input: VehicleInput, ip?: string | null) {
  const a = can(actor, "vehicles.manage") ? actor! : requireSeller(actor);
  const v = await loadOwned(a, vehicleId);
  const editable: VehicleStatus[] = ["DRAFT", "REJECTED", "PENDING_APPROVAL", "PUBLISHED", "AUCTION_ENDED"];
  if (!editable.includes(v.status) && !can(a, "vehicles.manage")) throw conflict("This listing can't be edited while an auction is live or a sale is in progress.");
  const derived = await buildDerived(prisma, input);
  const data = { ...toData(input), ...derived };
  // Auction & pricing can't change once an auction exists for a published vehicle.
  if (v.status === "PUBLISHED" && v.liveAuctionId) {
    const open = await prisma.auction.findFirst({ where: { vehicleId, status: { in: ["LIVE", "SCHEDULED"] } } });
    if (open) throw conflict("Pricing can't change while an auction is scheduled.");
  }
  // Material edits on a published listing send it back for review (unless admin).
  const material = ["expectedPrice", "kmDriven", "year", "makeId", "modelId", "accidentHistory", "floodDamage"] as const;
  const needsReview = v.status === "PUBLISHED" && !can(a, "vehicles.manage") && material.some((k) => JSON.stringify(v[k]) !== JSON.stringify(data[k]));
  const requireApproval = await getSetting("listing.requireApproval");
  const status: VehicleStatus = v.status === "REJECTED" ? "DRAFT" : needsReview && requireApproval ? "PENDING_APPROVAL" : v.status;
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.vehicle.update({ where: { id: vehicleId }, data: { ...data, status } });
    const d = diff(v as unknown as Record<string, unknown>, data as unknown as Record<string, unknown>);
    await audit({ userId: a.userId, action: "vehicle.update", entityType: "Vehicle", entityId: vehicleId, before: d.before, after: { ...d.after, status }, ip }, tx);
    return u;
  });
  return updated;
}

export async function setVehicleMedia(
  actor: Actor | null,
  vehicleId: string,
  media: { images: { fileId: string; kind: MediaKind; alt?: string }[]; documents: { fileId: string; type: VehicleDocType }[] },
) {
  const a = can(actor, "vehicles.manage") ? actor! : requireSeller(actor);
  const v = await loadOwned(a, vehicleId);
  const maxImages = await getSetting("listing.maxImages");
  const photos = media.images.filter((i) => i.kind !== "VIDEO");
  if (photos.length > maxImages) throw new AppError("VALIDATION", `You can upload up to ${maxImages} photos.`);
  const ids = [...media.images.map((i) => i.fileId), ...media.documents.map((d) => d.fileId)];
  const files = await prisma.storedFile.findMany({ where: { id: { in: ids } } });
  const byId = new Map(files.map((f) => [f.id, f]));
  const current = new Set([
    ...(await prisma.vehicleImage.findMany({ where: { vehicleId }, select: { url: true } })).map((x) => x.url.replace(/^\/media\//, "")),
    ...(await prisma.vehicleDocument.findMany({ where: { vehicleId }, select: { fileId: true } })).map((x) => x.fileId),
  ]);
  for (const id of ids) {
    const f = byId.get(id);
    if (!f) throw new AppError("VALIDATION", "One of the uploaded files was not found. Please re-upload.");
    if ((f.purpose === "vehicle-image" || f.purpose === "vehicle-doc") === false) throw new AppError("VALIDATION", "That file can't be attached to a vehicle.");
    const alreadyAttached = current.has(f.key) || current.has(f.id);
    if (!alreadyAttached && f.ownerId !== a.userId && !can(a, "vehicles.manage")) {
      // Allow files uploaded by colleagues at the same dealership.
      const colleague = f.ownerId ? await prisma.dealerUser.findFirst({ where: { userId: f.ownerId, dealerId: v.dealerId } }) : null;
      if (!colleague) throw forbidden("You can only attach files you uploaded.");
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.vehicleImage.deleteMany({ where: { vehicleId } });
    let order = 0;
    for (const img of media.images) {
      const f = byId.get(img.fileId)!;
      const url = `/media/${f.key}`;
      const thumbUrl = f.mime === "image/webp" ? `/media/${f.key.replace(/\.webp$/, "_t.webp")}` : null;
      await tx.vehicleImage.create({ data: { vehicleId, kind: img.kind, url, thumbUrl, width: f.width, height: f.height, alt: img.alt ?? v.title, sortOrder: order++ } });
    }
    await tx.vehicleDocument.deleteMany({ where: { vehicleId } });
    for (const d of media.documents) await tx.vehicleDocument.create({ data: { vehicleId, type: d.type, fileId: d.fileId } });
    await audit({ userId: a.userId, action: "vehicle.media", entityType: "Vehicle", entityId: vehicleId, after: { images: media.images.length, documents: media.documents.length } }, tx);
  });
}

/** Seller submits a draft for approval (or auto-publishes when approval is disabled). */
export async function submitVehicle(actor: Actor | null, vehicleId: string, ip?: string | null) {
  const seller = requireVerifiedSeller(actor);
  const v = await loadOwned(seller, vehicleId);
  if (v.status !== "DRAFT" && v.status !== "REJECTED") throw conflict("Only drafts can be submitted.");
  const [minImages, requireApproval] = await Promise.all([getSetting("listing.minImages"), getSetting("listing.requireApproval")]);
  const photoCount = await prisma.vehicleImage.count({ where: { vehicleId, kind: "PHOTO" } });
  if (photoCount < minImages) throw new AppError("VALIDATION", `Add at least ${minImages} photo${minImages > 1 ? "s" : ""} before submitting.`);
  await assertListingQuota(seller.dealer.id);
  return prisma.$transaction(async (tx) => {
    await createListingChargeTx(tx, seller.dealer.id, seller.userId, v.id, v.expectedPrice, "LISTING_FEE");
    if (v.auctionEnabled) await createListingChargeTx(tx, seller.dealer.id, seller.userId, v.id, v.expectedPrice, "AUCTION_FEE");
    await tx.vehicle.update({ where: { id: vehicleId }, data: { status: "PENDING_APPROVAL", statusReason: null } });
    await audit({ userId: seller.userId, action: "vehicle.submit", entityType: "Vehicle", entityId: vehicleId, ip }, tx);
    if (!requireApproval) return publishTx(tx, vehicleId, null);
    return tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  });
}

async function publishTx(tx: Tx, vehicleId: string, adminId: string | null) {
  const v = await tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  if (await getSetting("listing.requireFeeBeforeApproval", tx)) {
    const unpaid = await tx.payment.findFirst({ where: { targetId: vehicleId, purpose: "LISTING_FEE", status: { not: "PAID" } } });
    if (unpaid) throw conflict("The listing fee for this vehicle hasn't been paid yet.");
  }
  await tx.vehicle.update({ where: { id: vehicleId }, data: { status: "PUBLISHED", publishedAt: v.publishedAt ?? new Date(), statusReason: null } });
  if (v.auctionEnabled) await createAuctionTx(tx, v);
  await audit({ userId: adminId, action: "vehicle.approve", entityType: "Vehicle", entityId: vehicleId, before: { status: v.status }, after: { status: "PUBLISHED" } }, tx);
  await notifyDealer(v.dealerId, { type: "VEHICLE_APPROVED", title: "Listing approved", body: `${v.title} is now live${v.auctionEnabled ? " with an auction" : ""}.`, link: `/dashboard/vehicles` }, tx);
  return tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
}

export async function adminApproveVehicle(actor: Actor, vehicleId: string) {
  if (!can(actor, "vehicles.manage")) throw forbidden();
  return prisma.$transaction(async (tx) => {
    const v = await tx.vehicle.findUnique({ where: { id: vehicleId } });
    if (!v) throw notFound();
    if (v.status !== "PENDING_APPROVAL") throw conflict("Only listings pending approval can be approved.");
    return publishTx(tx, vehicleId, actor.userId);
  });
}

export async function adminSetVehicleStatus(actor: Actor, vehicleId: string, action: "reject" | "suspend" | "remove" | "reinstate", reason: string) {
  if (!can(actor, "vehicles.manage")) throw forbidden();
  return prisma.$transaction(async (tx) => {
    const v = await tx.vehicle.findUnique({ where: { id: vehicleId } });
    if (!v) throw notFound();
    const open = await tx.auction.findFirst({ where: { vehicleId, status: { in: ["LIVE", "SCHEDULED"] } } });
    const activeOrder = await tx.order.findUnique({ where: { activeVehicleKey: vehicleId } });
    if (activeOrder && activeOrder.status !== "COMPLETED" && action !== "reinstate") throw conflict("This vehicle has an order in progress. Resolve the order first.");
    let status: VehicleStatus;
    if (action === "reject") {
      if (v.status !== "PENDING_APPROVAL") throw conflict("Only pending listings can be rejected.");
      status = "REJECTED";
    } else if (action === "suspend") status = "SUSPENDED";
    else if (action === "remove") status = "CANCELLED";
    else {
      if (v.status !== "SUSPENDED") throw conflict("Only suspended listings can be reinstated.");
      status = "PUBLISHED";
    }
    if (open && (action === "suspend" || action === "remove")) {
      await tx.auction.update({ where: { id: open.id }, data: { status: "CANCELLED", result: "CANCELLED", closedAt: new Date() } });
      await tx.autoBid.updateMany({ where: { auctionId: open.id }, data: { active: false } });
    }
    await tx.vehicle.update({ where: { id: vehicleId }, data: { status, statusReason: reason || null, ...(open && action !== "reject" ? { liveAuctionId: null, currentBid: null, bidCount: 0 } : {}) } });
    await audit({ userId: actor.userId, action: `vehicle.${action}`, entityType: "Vehicle", entityId: vehicleId, before: { status: v.status }, after: { status, reason } }, tx);
    await notifyDealer(v.dealerId, {
      type: action === "reject" ? "VEHICLE_REJECTED" : "SYSTEM",
      title: action === "reject" ? "Listing needs changes" : action === "reinstate" ? "Listing reinstated" : `Listing ${action === "suspend" ? "suspended" : "removed"}`,
      body: `${v.title}${reason ? ` — ${reason}` : ""}`,
      link: `/dashboard/vehicles`,
    }, tx);
  });
}

export async function adminFeatureVehicle(actor: Actor, vehicleId: string, days: number) {
  if (!can(actor, "vehicles.manage")) throw forbidden();
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!v) throw notFound();
  const until = days > 0 ? new Date(Date.now() + days * 86400_000) : null;
  await prisma.$transaction(async (tx) => {
    await tx.vehicle.update({ where: { id: vehicleId }, data: { featuredUntil: until } });
    if (until) await tx.featureListing.create({ data: { vehicleId, dealerId: v.dealerId, startAt: new Date(), endAt: until, amount: 0, active: true, grantedById: actor.userId } });
    await audit({ userId: actor.userId, action: until ? "vehicle.feature" : "vehicle.unfeature", entityType: "Vehicle", entityId: vehicleId, after: { featuredUntil: until } }, tx);
  });
}

/** Seller withdraws a listing that has no live auction bids or sale in progress. */
export async function withdrawVehicle(actor: Actor | null, vehicleId: string) {
  const seller = requireSeller(actor);
  const v = await loadOwned(seller, vehicleId);
  if (["RESERVED", "SOLD", "CANCELLED"].includes(v.status)) throw conflict("This listing can't be withdrawn.");
  const open = await prisma.auction.findFirst({ where: { vehicleId, status: { in: ["LIVE", "SCHEDULED"] } } });
  if (open && open.bidCount > 0) throw conflict("This auction already has bids and can't be withdrawn. Contact support.");
  await prisma.$transaction(async (tx) => {
    if (open) await tx.auction.update({ where: { id: open.id }, data: { status: "CANCELLED", result: "CANCELLED", closedAt: new Date() } });
    await tx.vehicle.update({ where: { id: vehicleId }, data: { status: "CANCELLED", statusReason: "Withdrawn by seller" } });
    await tx.offer.updateMany({ where: { vehicleId, status: { in: ["PENDING", "COUNTERED"] } }, data: { status: "EXPIRED" } });
    await audit({ userId: seller.userId, action: "vehicle.withdraw", entityType: "Vehicle", entityId: vehicleId }, tx);
  });
}

// ───────────────────────── Search & read models ─────────────────────────

export async function searchVehicles(params: VehicleSearch) {
  const where: Prisma.VehicleWhereInput = { status: { in: PUBLIC_STATUSES } };
  const and: Prisma.VehicleWhereInput[] = [];
  const text = textFilter(params.q);
  if (text) and.push(text);
  if (params.make) and.push({ make: { slug: params.make } });
  if (params.model) and.push({ model: { slug: params.model } });
  if (params.variant) and.push({ variantName: { contains: params.variant, mode: "insensitive" } });
  if (params.priceMin) and.push({ expectedPrice: { gte: params.priceMin } });
  if (params.priceMax) and.push({ expectedPrice: { lte: params.priceMax } });
  if (params.yearMin) and.push({ year: { gte: params.yearMin } });
  if (params.yearMax) and.push({ year: { lte: params.yearMax } });
  if (params.kmMax) and.push({ kmDriven: { lte: params.kmMax } });
  if (params.fuel?.length) and.push({ fuel: { in: params.fuel } });
  if (params.transmission?.length) and.push({ transmission: { in: params.transmission } });
  if (params.body?.length) and.push({ bodyType: { in: params.body } });
  if (params.condition?.length) and.push({ overallCondition: { in: params.condition } });
  if (params.state) and.push({ state: { slug: params.state } });
  if (params.district) and.push({ district: { slug: params.district } });
  if (params.dealer) and.push({ dealer: { slug: params.dealer } });
  if (params.auction === "live") and.push({ status: "AUCTION_LIVE" });
  if (params.auction === "upcoming") and.push({ status: "PUBLISHED", auctionEnabled: true, auctionStartAt: { gt: new Date() } });
  if (params.auction === "none") and.push({ auctionEnabled: false });
  if (params.buyNow) and.push({ buyNowEnabled: true, buyNowPrice: { not: null } });
  if (params.inspected) and.push({ inspectionVerified: true });
  if (params.luxury) and.push({ make: { isLuxury: true } });
  if (and.length) where.AND = and;

  const orderBy: Prisma.VehicleOrderByWithRelationInput[] = (() => {
    switch (params.sort) {
      case "price_asc":
        return [{ expectedPrice: "asc" }];
      case "price_desc":
        return [{ expectedPrice: "desc" }];
      case "km_asc":
        return [{ kmDriven: "asc" }];
      case "ending_soon":
        return [{ auctionEndAt: { sort: "asc", nulls: "last" } }];
      case "most_bids":
        return [{ bidCount: "desc" }];
      case "popular":
        return [{ viewCount: "desc" }];
      default:
        return [{ publishedAt: { sort: "desc", nulls: "last" } }];
    }
  })();
  orderBy.push({ id: "asc" }); // stable pagination

  const skip = (params.page - 1) * params.perPage;
  const [items, total] = await Promise.all([
    prisma.vehicle.findMany({ where, orderBy, skip, take: params.perPage, select: cardSelect }),
    prisma.vehicle.count({ where }),
  ]);
  return { items, total, page: params.page, perPage: params.perPage, pages: Math.max(1, Math.ceil(total / params.perPage)) };
}

export async function getVehicleByCode(code: string) {
  const v = await prisma.vehicle.findUnique({
    where: { code },
    include: {
      make: true,
      model: true,
      variant: true,
      state: true,
      district: true,
      city: true,
      dealer: { include: { state: true, district: true } },
      images: { orderBy: { sortOrder: "asc" } },
      documents: { select: { id: true, type: true } },
      inspections: { where: { status: "COMPLETED" }, orderBy: { inspectedAt: "desc" }, take: 1 },
      auctions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return v;
}

export type VehicleDetail = NonNullable<Awaited<ReturnType<typeof getVehicleByCode>>>;

/** Strips private fields before sending a vehicle to a non-owner. */
export function publicVehicle(v: Vehicle) {
  const { sellerMargin, vin, engineNumber, registrationNumber, reservePrice, ...rest } = v;
  void sellerMargin;
  void vin;
  void engineNumber;
  void registrationNumber;
  return { ...rest, reservePrice: v.reserveVisible ? reservePrice : null };
}

export async function recordView(vehicleId: string) {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  await prisma.$transaction([
    prisma.vehicle.update({ where: { id: vehicleId }, data: { viewCount: { increment: 1 } } }),
    prisma.vehicleDailyStat.upsert({
      where: { vehicleId_day: { vehicleId, day } },
      create: { vehicleId, day, views: 1 },
      update: { views: { increment: 1 } },
    }),
  ]);
}

export async function toggleWatch(userId: string, vehicleId: string, on: boolean) {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
  if (!v) throw notFound();
  const existing = await prisma.watchlist.findUnique({ where: { userId_vehicleId: { userId, vehicleId } } });
  if (on && !existing) {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    await prisma.$transaction([
      prisma.watchlist.create({ data: { userId, vehicleId } }),
      prisma.vehicle.update({ where: { id: vehicleId }, data: { watchCount: { increment: 1 } } }),
      prisma.vehicleDailyStat.upsert({ where: { vehicleId_day: { vehicleId, day } }, create: { vehicleId, day, watchAdds: 1 }, update: { watchAdds: { increment: 1 } } }),
    ]);
  } else if (!on && existing) {
    await prisma.$transaction([
      prisma.watchlist.delete({ where: { userId_vehicleId: { userId, vehicleId } } }),
      prisma.vehicle.update({ where: { id: vehicleId }, data: { watchCount: { decrement: 1 } } }),
    ]);
  }
  return { watching: on };
}

/** Expires featured flags whose period ended. */
export async function expireFeatured() {
  await prisma.vehicle.updateMany({ where: { featuredUntil: { lt: new Date() } }, data: { featuredUntil: null } });
  await prisma.featureListing.updateMany({ where: { active: true, endAt: { lt: new Date() } }, data: { active: false } });
}
