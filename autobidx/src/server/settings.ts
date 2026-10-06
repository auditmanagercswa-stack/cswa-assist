import { prisma, type Db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Every operational rule of the marketplace is configurable from the admin panel.
 * Defaults live here; overrides are stored in the Setting table.
 */
export const SETTING_DEFS = {
  // ── Auctions
  "auction.defaultDurationHours": { group: "Auctions", label: "Default auction duration (hours)", default: 24 as number },
  "auction.minDurationMinutes": { group: "Auctions", label: "Minimum auction duration (minutes)", default: 30 as number },
  "auction.maxDurationDays": { group: "Auctions", label: "Maximum auction duration (days)", default: 14 as number },
  "auction.incrementSlabs": {
    group: "Auctions",
    label: "Bid increment slabs (price up to → increment)",
    default: [
      { upTo: 300000, increment: 2000 },
      { upTo: 1000000, increment: 5000 },
      { upTo: 2500000, increment: 10000 },
      { upTo: null, increment: 25000 },
    ] as { upTo: number | null; increment: number }[],
  },
  "auction.antiSnipeTriggerSeconds": { group: "Auctions", label: "Anti-sniping trigger window (seconds)", default: 120 as number },
  "auction.antiSnipeExtendSeconds": { group: "Auctions", label: "Auction extension duration (seconds)", default: 120 as number },
  "auction.maxExtensions": { group: "Auctions", label: "Maximum extensions per auction (0 = unlimited)", default: 0 as number },
  "auction.reserveNotMetAcceptHours": { group: "Auctions", label: "Hours seller may accept highest bid when reserve not met", default: 24 as number },
  "bidding.maxBidMultiplier": { group: "Auctions", label: "Max bid as a multiple of asking price (fat-finger guard)", default: 3 as number },
  "bidding.perUserPerMinute": { group: "Auctions", label: "Max bids per user per minute", default: 20 as number },

  // ── Listings
  "listing.requireApproval": { group: "Listings", label: "New listings require admin approval", default: true as boolean },
  "listing.minImages": { group: "Listings", label: "Minimum photos to submit a listing", default: 1 as number },
  "listing.maxImages": { group: "Listings", label: "Maximum photos per listing", default: 30 as number },
  "listing.maxImageSizeMB": { group: "Listings", label: "Maximum image size (MB)", default: 10 as number },
  "listing.maxVideoSizeMB": { group: "Listings", label: "Maximum video size (MB)", default: 100 as number },
  "listing.maxDocumentSizeMB": { group: "Listings", label: "Maximum document size (MB)", default: 10 as number },
  "listing.requireFeeBeforeApproval": { group: "Listings", label: "Listing fee must be paid before approval", default: false as boolean },
  "featured.durationDays": { group: "Listings", label: "Featured listing duration (days)", default: 7 as number },

  // ── Catalog
  "catalog.enabledFuelTypes": { group: "Catalog", label: "Enabled fuel types", default: ["PETROL", "DIESEL", "CNG", "LPG", "ELECTRIC", "HYBRID"] as string[] },
  "catalog.enabledTransmissions": { group: "Catalog", label: "Enabled transmission types", default: ["MANUAL", "AUTOMATIC", "AMT", "CVT", "DCT"] as string[] },
  "catalog.enabledBodyTypes": { group: "Catalog", label: "Enabled vehicle categories", default: ["HATCHBACK", "SEDAN", "SUV", "MUV", "COUPE", "CONVERTIBLE", "PICKUP", "COMMERCIAL"] as string[] },

  // ── Offers & orders
  "offers.expiryHours": { group: "Offers & Orders", label: "Offer expiry (hours)", default: 48 as number },
  "offers.maxRounds": { group: "Offers & Orders", label: "Maximum negotiation rounds", default: 6 as number },
  "offers.minPercentOfAsking": { group: "Offers & Orders", label: "Minimum offer as % of asking price", default: 60 as number },
  "orders.paymentWindowHours": { group: "Offers & Orders", label: "Payment window after sale (hours)", default: 48 as number },

  // ── Tax
  "gst.rateBps": { group: "Tax", label: "Default GST rate on platform fees (bps, 1800 = 18%)", default: 1800 as number },
  "gst.platformGstin": { group: "Tax", label: "Platform GSTIN (shown on invoices)", default: "32ABXPL0000A1Z5" as string },
  "gst.platformLegalName": { group: "Tax", label: "Platform legal entity name", default: "AutoBidX Technologies Pvt. Ltd." as string },
  "gst.platformAddress": { group: "Tax", label: "Platform registered address", default: "Infopark Phase 2, Kakkanad, Kochi, Kerala 682042" as string },

  // ── Dealers
  "dealer.requiredKycDocs": {
    group: "Dealers",
    label: "Required KYC documents",
    default: ["PAN_CARD", "GST_CERTIFICATE", "REGISTRATION_CERTIFICATE", "ADDRESS_PROOF", "CANCELLED_CHEQUE"] as string[],
  },
  "dealer.requireGstin": { group: "Dealers", label: "GSTIN mandatory for dealers", default: true as boolean },
  "dealer.maxTeamMembers": { group: "Dealers", label: "Maximum team members per dealership", default: 10 as number },

  // ── Features
  "features.individualBuyers": { group: "Features", label: "Allow individual (non-dealer) buyers", default: false as boolean },
  "features.buyNow": { group: "Features", label: "Enable Buy Now", default: true as boolean },
  "features.offers": { group: "Features", label: "Enable offers & negotiation", default: true as boolean },
  "features.featuredListings": { group: "Features", label: "Enable paid featured listings", default: true as boolean },
  "features.subscriptions": { group: "Features", label: "Enable dealer subscriptions", default: true as boolean },
  "features.inspections": { group: "Features", label: "Enable inspection requests", default: true as boolean },

  // ── Payments
  "payments.enabledMethods": { group: "Payments", label: "Enabled payment methods", default: ["UPI", "NETBANKING", "CARD", "BANK_TRANSFER"] as string[] },
  "payments.bankTransferDetails": {
    group: "Payments",
    label: "Bank transfer instructions",
    default: "AutoBidX Escrow A/c · Federal Bank · IFSC FDRL0001234 · A/c 1234 5678 9012 (demo details)" as string,
  },

  // ── Notifications
  "notifications.channels": {
    group: "Notifications",
    label: "Enabled delivery channels",
    default: { EMAIL: true, SMS: false, WHATSAPP: false, PUSH: false } as Record<string, boolean>,
  },
  "notifications.auctionEndingMinutes": { group: "Notifications", label: "Send 'auction ending' alerts this many minutes before end", default: 30 as number },

  // ── Fraud
  "fraud.rapidBidCount": { group: "Fraud", label: "Rapid-bidding threshold (bids in window)", default: 10 as number },
  "fraud.rapidBidWindowSeconds": { group: "Fraud", label: "Rapid-bidding window (seconds)", default: 60 as number },
  "fraud.failedPaymentThreshold": { group: "Fraud", label: "Failed payments before flag", default: 3 as number },
  "fraud.bidCancellationThreshold": { group: "Fraud", label: "Bid cancellations (30 days) before flag", default: 3 as number },

  // ── Platform
  "platform.supportEmail": { group: "Platform", label: "Support email", default: "support@autobidx.in" as string },
  "platform.supportPhone": { group: "Platform", label: "Support phone", default: "+91 484 400 0000" as string },
} as const;

export type SettingKey = keyof typeof SETTING_DEFS;
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFS)[K]["default"] extends infer T
  ? T extends readonly (infer U)[]
    ? U[]
    : T extends boolean
      ? boolean
      : T extends number
        ? number
        : T extends string
          ? string
          : T
  : never;

type Cache = { at: number; values: Map<string, unknown> };
const g = globalThis as unknown as { __settingsCache?: Cache };
const TTL_MS = 30_000;

async function loadAll(db: Db = prisma): Promise<Map<string, unknown>> {
  const now = Date.now();
  if (g.__settingsCache && now - g.__settingsCache.at < TTL_MS && db === prisma) return g.__settingsCache.values;
  const rows = await db.setting.findMany();
  const values = new Map<string, unknown>(rows.map((r) => [r.key, r.value]));
  if (db === prisma) g.__settingsCache = { at: now, values };
  return values;
}

export function invalidateSettings() {
  g.__settingsCache = undefined;
}

export async function getSetting<K extends SettingKey>(key: K, db?: Db): Promise<SettingValue<K>> {
  const all = await loadAll(db);
  return (all.has(key) ? all.get(key) : SETTING_DEFS[key].default) as SettingValue<K>;
}

export async function getSettings<K extends SettingKey>(keys: K[], db?: Db): Promise<{ [P in K]: SettingValue<P> }> {
  const all = await loadAll(db);
  const out = {} as { [P in K]: SettingValue<P> };
  for (const k of keys) (out as Record<string, unknown>)[k] = all.has(k) ? all.get(k) : SETTING_DEFS[k].default;
  return out;
}

export async function listSettings() {
  const all = await loadAll();
  return (Object.keys(SETTING_DEFS) as SettingKey[]).map((key) => ({
    key,
    group: SETTING_DEFS[key].group,
    label: SETTING_DEFS[key].label,
    value: all.has(key) ? all.get(key) : SETTING_DEFS[key].default,
    isDefault: !all.has(key),
    default: SETTING_DEFS[key].default as unknown,
  }));
}

/** Validates that the new value has the same shape as the default. */
export function validateSettingValue(key: SettingKey, value: unknown): string | null {
  const def = SETTING_DEFS[key].default as unknown;
  if (typeof def === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "Must be a non-negative number";
  } else if (typeof def === "boolean") {
    if (typeof value !== "boolean") return "Must be true or false";
  } else if (typeof def === "string") {
    if (typeof value !== "string" || value.length > 2000) return "Must be text (max 2000 characters)";
  } else if (Array.isArray(def)) {
    if (!Array.isArray(value)) return "Must be a list";
    if (key === "auction.incrementSlabs") {
      for (const s of value as { upTo: unknown; increment: unknown }[]) {
        if (typeof s?.increment !== "number" || s.increment <= 0) return "Each slab needs a positive increment";
        if (s.upTo !== null && typeof s.upTo !== "number") return "Slab 'upTo' must be a number or null";
      }
    } else if (!value.every((v) => typeof v === "string")) return "Must be a list of text values";
  } else if (typeof def === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return "Must be an object";
  }
  return null;
}

export async function updateSetting(key: SettingKey, value: unknown, userId: string) {
  const err = validateSettingValue(key, value);
  if (err) throw new Error(err);
  const def = SETTING_DEFS[key];
  const prev = await prisma.setting.findUnique({ where: { key } });
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue, group: def.group, label: def.label, updatedById: userId },
    update: { value: value as Prisma.InputJsonValue, updatedById: userId },
  });
  invalidateSettings();
  return { before: prev?.value ?? def.default, after: value };
}

/** Bid increment for a given current price using the configured slabs. */
export async function incrementFor(price: number, db?: Db): Promise<number> {
  const slabs = await getSetting("auction.incrementSlabs", db);
  for (const s of slabs) if (s.upTo === null || price < s.upTo) return s.increment;
  return slabs[slabs.length - 1]?.increment ?? 5000;
}
