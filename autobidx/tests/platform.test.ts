import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { sniffMime, storeUpload } from "@/server/storage/upload";
import { notify } from "@/server/notifications/notify";
import { runDueJobs } from "@/server/jobs/queue";
import { updateSetting } from "@/server/settings";
import { flagRapidBidding, registrationChecks } from "@/server/services/fraud";
import { decryptField, encryptField } from "@/lib/crypto";
import { adminReviewKyc, saveKyc } from "@/server/services/dealers";
import { kycSchema } from "@/lib/validation";
import { expectAppError, makeAdmin, makeDealer, makeLiveAuction, makeVehicle, seedWorld, type World, actorFor } from "./helpers";

let w: World;
beforeEach(async () => {
  w = await seedWorld();
});

describe("file uploads", () => {
  it("sniffs real content types, re-encodes images to WebP with a thumbnail, rejects spoofed files", async () => {
    const d = await makeDealer(w);
    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#c33" } }).png().toBuffer();
    expect(sniffMime(png)).toBe("image/png");
    const up = await storeUpload({ data: png, kind: "image", ownerId: d.user.id, purpose: "vehicle-image", isPublic: true, originalName: "car.png" });
    expect(up.mime).toBe("image/webp");
    expect(up.url).toMatch(/\.webp$/);
    expect(up.thumbUrl).toMatch(/_t\.webp$/);
    // a "jpg" that is actually HTML
    await expectAppError(storeUpload({ data: Buffer.from("<html><script>alert(1)</script></html>"), kind: "image", ownerId: d.user.id, purpose: "vehicle-image" }), "VALIDATION");
    // too small
    const tiny = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#000" } }).png().toBuffer();
    await expectAppError(storeUpload({ data: tiny, kind: "image", ownerId: d.user.id, purpose: "vehicle-image" }), "VALIDATION");
    // PDF documents are accepted privately
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(100)]);
    const doc = await storeUpload({ data: pdf, kind: "document", ownerId: d.user.id, purpose: "kyc" });
    expect(doc.url).toBeNull();
    const admin = await makeAdmin();
    await updateSetting("listing.maxDocumentSizeMB", 0, admin.user.id);
    await expectAppError(storeUpload({ data: pdf, kind: "document", ownerId: d.user.id, purpose: "kyc" }), "VALIDATION");
  });
});

describe("notifications", () => {
  it("creates in-app notifications and queues external channel deliveries", async () => {
    const d = await makeDealer(w);
    await notify(d.user.id, { type: "OUTBID", title: "Outbid", body: "x", link: "/" });
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: d.user.id }, include: { deliveries: true } });
    expect(n.deliveries.map((x) => x.channel)).toEqual(["EMAIL"]); // SMS/WhatsApp off by default
    await runDueJobs();
    const dl = await prisma.notificationDelivery.findFirstOrThrow({ where: { notificationId: n.id } });
    expect(dl.status).toBe("SENT");
    const admin = await makeAdmin();
    await updateSetting("notifications.channels", { EMAIL: true, SMS: true, WHATSAPP: true, PUSH: false }, admin.user.id);
    await notify(d.user.id, { type: "AUCTION_WON", title: "Won", body: "x" });
    const urgent = await prisma.notification.findFirstOrThrow({ where: { userId: d.user.id, type: "AUCTION_WON" }, include: { deliveries: true } });
    expect(urgent.deliveries.map((x) => x.channel).sort()).toEqual(["EMAIL", "SMS", "WHATSAPP"]);
    await runDueJobs();
    const sms = await prisma.notificationDelivery.findFirstOrThrow({ where: { notificationId: urgent.id, channel: "SMS" } });
    expect(sms.status).toBe("SKIPPED"); // provider integration pending — recorded, not silently dropped
  });
});

describe("KYC", () => {
  it("encrypts bank details, requires documents to submit, and admin approval verifies the dealer", async () => {
    const d = await makeDealer(w, { status: "PENDING" });
    const actor = await actorFor(d.user.id);
    const fields = { bankAccountName: "Test Motors", bankAccountNumber: "123456789012", bankIfsc: "fdrl0001234", bankName: "Federal", authorizedName: "Owner", authorizedDesignation: "Proprietor", authorizedPan: "abcde1234f", authorizedPhone: "9847000000", documents: [], submit: true };
    await expectAppError(saveKyc(actor, kycSchema.parse(fields)), "VALIDATION");
    const docs = [];
    for (const type of ["PAN_CARD", "GST_CERTIFICATE", "REGISTRATION_CERTIFICATE", "ADDRESS_PROOF", "CANCELLED_CHEQUE"] as const) {
      const f = await prisma.storedFile.create({ data: { ownerId: d.user.id, key: `kyc/t/${type}-${Math.random()}.pdf`, mime: "application/pdf", size: 1, sha256: "x", purpose: "kyc" } });
      docs.push({ type, fileId: f.id });
    }
    await saveKyc(actor, kycSchema.parse({ ...fields, documents: docs }));
    const kyc = await prisma.kycSubmission.findFirstOrThrow({ where: { dealerId: d.dealer.id } });
    expect(kyc.bankAccountEnc).not.toContain("123456789012");
    expect(decryptField(kyc.bankAccountEnc!)).toBe("123456789012");
    expect(kyc.bankAccountLast4).toBe("9012");
    expect((await prisma.dealer.findUniqueOrThrow({ where: { id: d.dealer.id } })).status).toBe("UNDER_REVIEW");
    const admin = await makeAdmin();
    await expectAppError(adminReviewKyc(admin.actor, d.dealer.id, "REJECT", ""), "VALIDATION");
    await adminReviewKyc(admin.actor, d.dealer.id, "APPROVE", "");
    expect((await prisma.dealer.findUniqueOrThrow({ where: { id: d.dealer.id } })).status).toBe("VERIFIED");
    expect(await prisma.notification.count({ where: { userId: d.user.id, type: "KYC_APPROVED" } })).toBe(1);
    expect(encryptField("a")).not.toBe(encryptField("a")); // random IV
  });
});

describe("fraud heuristics (flag only, never auto-ban)", () => {
  it("flags rapid bidding and suspended identities re-registering", async () => {
    const seller = await makeDealer(w);
    const bidder = await makeDealer(w);
    const v = await makeVehicle(w, seller.dealer.id);
    const a = await makeLiveAuction(v.id);
    for (let i = 0; i < 10; i++) await prisma.bid.create({ data: { auctionId: a.id, bidderId: bidder.user.id, amount: 500000 + i * 10000 } });
    await flagRapidBidding(bidder.user.id);
    expect(await prisma.fraudFlag.count({ where: { type: "RAPID_BIDDING", userId: bidder.user.id } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: bidder.user.id } })).status).toBe("ACTIVE");

    await prisma.dealer.update({ where: { id: seller.dealer.id }, data: { status: "SUSPENDED", pan: "ZZZZZ9999Z" } });
    const fresh = await makeDealer(w);
    await registrationChecks({ userId: fresh.user.id, dealerId: fresh.dealer.id, pan: "ZZZZZ9999Z", gstin: null, phone: "9000000000", ip: null, fingerprint: null });
    expect(await prisma.fraudFlag.count({ where: { type: "SUSPENDED_REREGISTER" } })).toBe(1);
  });
});
