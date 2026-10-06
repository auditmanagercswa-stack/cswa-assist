import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { vehicleSchema, vehicleSearchSchema } from "@/lib/validation";
import { adminApproveVehicle, adminSetVehicleStatus, createVehicle, searchVehicles, setVehicleMedia, submitVehicle, toggleWatch } from "@/server/services/vehicles";
import { expectAppError, makeAdmin, makeDealer, makeVehicle, seedWorld, type World } from "./helpers";
import { sha256 } from "@/lib/crypto";

let w: World;
beforeEach(async () => {
  w = await seedWorld();
});

const base = (w: World, over: Record<string, unknown> = {}) =>
  vehicleSchema.parse({
    makeId: w.make.id, modelId: w.model.id, variantId: w.variant.id, year: 2021, registrationYear: 2021, registrationNumber: "KL 07 CX 1234", fuel: "PETROL", transmission: "MANUAL", kmDriven: 32000, color: "White", owners: 1,
    insuranceStatus: "COMPREHENSIVE", rcStatus: "ORIGINAL", stateId: w.state.id, districtId: w.district.id, cityId: w.city.id, pincode: "682001", overallCondition: "GOOD", accidentHistory: false, floodDamage: false,
    engineCondition: "GOOD", gearboxCondition: "GOOD", tyreCondition: "GOOD", batteryCondition: "GOOD", serviceHistory: "FULL", expectedPrice: 1100000, reservePrice: 1050000, minimumBid: 900000, buyNowPrice: null,
    sellerMargin: 50000, buyNowEnabled: false, offersEnabled: true, auctionEnabled: true, auctionStartAt: null, auctionEndAt: null, bidIncrement: null, autoExtendSeconds: null, reserveVisible: false, ...over,
  });

async function photo(ownerId: string) {
  return prisma.storedFile.create({ data: { ownerId, key: `vehicle-image/t/${Math.random()}.webp`, mime: "image/webp", size: 100, sha256: sha256("x"), visibility: "PUBLIC", purpose: "vehicle-image" } });
}

describe("vehicle listing", () => {
  it("validates business rules in the schema", () => {
    expect(vehicleSchema.safeParse({ ...base(w), registrationYear: 2019, year: 2021 }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...base(w), buyNowEnabled: true, buyNowPrice: null }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...base(w), minimumBid: 1200000 }).success).toBe(false);
    expect(base(w).registrationNumber).toBe("KL07CX1234");
  });

  it("create → media → submit → admin approve publishes and starts the auction", async () => {
    const d = await makeDealer(w);
    const v = await createVehicle(d.actor, base(w));
    expect(v.status).toBe("DRAFT");
    expect(v.title).toBe("2021 Hyundai Creta SX");
    expect(v.searchText).toContain("creta");
    await expectAppError(submitVehicle(d.actor, v.id), "VALIDATION"); // needs photos
    const f = await photo(d.user.id);
    await setVehicleMedia(d.actor, v.id, { images: [{ fileId: f.id, kind: "PHOTO" }], documents: [] });
    const submitted = await submitVehicle(d.actor, v.id);
    expect(submitted.status).toBe("PENDING_APPROVAL");
    // FREE plan → listing fee charge (₹499 + GST)
    const charge = await prisma.payment.findFirstOrThrow({ where: { targetId: v.id, purpose: "LISTING_FEE" } });
    expect(charge.amount).toBe(589);
    const admin = await makeAdmin();
    const pub = await adminApproveVehicle(admin.actor, v.id);
    expect(pub.status).toBe("AUCTION_LIVE");
    const auction = await prisma.auction.findFirstOrThrow({ where: { vehicleId: v.id } });
    expect(auction.status).toBe("LIVE");
    expect(auction.startingBid).toBe(900000);
    expect(auction.bidIncrement).toBe(5000); // slab default for < ₹10L
    expect(auction.reservePrice).toBe(1050000);
  });

  it("unverified dealers can draft but not submit; others can't touch the listing or its files", async () => {
    const pending = await makeDealer(w, { status: "PENDING" });
    const v = await createVehicle(pending.actor, base(w));
    await expectAppError(submitVehicle(pending.actor, v.id), "NOT_VERIFIED");
    const other = await makeDealer(w);
    await expectAppError(setVehicleMedia(other.actor, v.id, { images: [], documents: [] }), "NOT_FOUND");
    const theirs = await photo(other.user.id);
    await expectAppError(setVehicleMedia(pending.actor, v.id, { images: [{ fileId: theirs.id, kind: "PHOTO" }], documents: [] }), "FORBIDDEN");
  });

  it("admin reject / suspend / reinstate with reasons and notifications", async () => {
    const d = await makeDealer(w);
    const admin = await makeAdmin();
    const v = await makeVehicle(w, d.dealer.id, { status: "PENDING_APPROVAL", publishedAt: null });
    await adminSetVehicleStatus(admin.actor, v.id, "reject", "Add RC photo");
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).statusReason).toBe("Add RC photo");
    expect(await prisma.notification.count({ where: { userId: d.user.id, type: "VEHICLE_REJECTED" } })).toBe(1);
    const p = await makeVehicle(w, d.dealer.id);
    await adminSetVehicleStatus(admin.actor, p.id, "suspend", "Duplicate listing");
    await adminSetVehicleStatus(admin.actor, p.id, "reinstate", "");
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PUBLISHED");
    await expectAppError(adminSetVehicleStatus(d.actor, p.id, "suspend", "x"), "FORBIDDEN");
  });

  it("enforces subscription listing limits", async () => {
    const d = await makeDealer(w);
    await prisma.subscriptionPlan.update({ where: { id: w.free.id }, data: { listingLimit: 1 } });
    await makeVehicle(w, d.dealer.id);
    const v = await createVehicle(d.actor, base(w));
    const f = await photo(d.user.id);
    await setVehicleMedia(d.actor, v.id, { images: [{ fileId: f.id, kind: "PHOTO" }], documents: [] });
    await expectAppError(submitVehicle(d.actor, v.id), "FORBIDDEN");
  });
});

describe("search", () => {
  it("filters, sorts, paginates and only shows public listings", async () => {
    const d = await makeDealer(w);
    await makeVehicle(w, d.dealer.id, { expectedPrice: 500000, kmDriven: 10000, searchText: "hyundai creta sx kochi diesel", fuel: "DIESEL" });
    await makeVehicle(w, d.dealer.id, { expectedPrice: 900000, kmDriven: 50000, searchText: "hyundai creta sx kochi petrol" });
    await makeVehicle(w, d.dealer.id, { expectedPrice: 700000, status: "DRAFT", searchText: "hyundai creta draft" });
    const all = await searchVehicles(vehicleSearchSchema.parse({}));
    expect(all.total).toBe(2);
    const diesel = await searchVehicles(vehicleSearchSchema.parse({ fuel: "DIESEL" }));
    expect(diesel.total).toBe(1);
    const cheap = await searchVehicles(vehicleSearchSchema.parse({ sort: "price_asc" }));
    expect(cheap.items[0].expectedPrice).toBe(500000);
    const text = await searchVehicles(vehicleSearchSchema.parse({ q: "creta petrol" }));
    expect(text.total).toBe(1);
    const range = await searchVehicles(vehicleSearchSchema.parse({ priceMax: "600000", make: "hyundai" }));
    expect(range.total).toBe(1);
    const page = await searchVehicles(vehicleSearchSchema.parse({ perPage: "6", page: "2" }));
    expect(page.items).toHaveLength(0);
    // private fields never selected for cards
    expect(Object.keys(all.items[0])).not.toContain("registrationNumber");
    expect(Object.keys(all.items[0])).not.toContain("sellerMargin");
  });

  it("watchlist add/remove keeps counters in sync", async () => {
    const d = await makeDealer(w);
    const v = await makeVehicle(w, d.dealer.id);
    await toggleWatch(d.user.id, v.id, true);
    await toggleWatch(d.user.id, v.id, true);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).watchCount).toBe(1);
    await toggleWatch(d.user.id, v.id, false);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).watchCount).toBe(0);
  });
});
