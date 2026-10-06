/* eslint-disable no-console */
/**
 * AutoBidX demo seed — realistic Indian marketplace data.
 * Re-runnable: wipes all tables first. Run: npm run db:seed
 */
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { BodyType, FuelType, OrderStatus, Prisma, Transmission } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { slugify } from "../src/lib/slug";
import { encryptField, sha256 } from "../src/lib/crypto";
import { carSceneSvg, hashString, interiorSvg, PAINT_COLORS, wheelDetailSvg, type Scene } from "../src/lib/car-art";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "../src/server/auth/permissions";
import { calculateTransactionFees, loadFees } from "../src/server/services/fees";
import { INSPECTION_CHECKLIST, inspectionScore } from "../src/server/services/inspections";
import { hashPassword } from "../src/server/auth/password";
import { CATALOG, DEALER_NAMES, FAQS, FIRST_NAMES, HELP_ARTICLES, LAST_NAMES, LEGAL_BODY, STATES, TESTIMONIALS } from "./seed-data";
import { LEGAL_PAGES } from "../src/server/services/cms";

// ───────── deterministic randomness ─────────
let rs = 20261006;
const rand = () => {
  rs ^= rs << 13;
  rs ^= rs >>> 17;
  rs ^= rs << 5;
  return ((rs >>> 0) % 1_000_000) / 1_000_000;
};
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const round = (n: number, to: number) => Math.round(n / to) * to;
const H = 3600_000;
const D = 24 * H;
const now = Date.now();
const ago = (ms: number) => new Date(now - ms);
const ahead = (ms: number) => new Date(now + ms);
const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789";
const usedCodes = new Set<string>();
const code = () => {
  let c = "";
  do {
    c = Array.from({ length: 6 }, () => ALPHA[Math.floor(rand() * ALPHA.length)]).join("");
  } while (usedCodes.has(c));
  usedCodes.add(c);
  return c;
};
let refSeq = 1000;
const ref = (p: string) => `${p}-${String(++refSeq).padStart(6, "0")}`;

const STORAGE = process.env.STORAGE_DIR || "./storage";

async function writeFileKey(key: string, data: Buffer) {
  const full = path.join(STORAGE, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
}

// ───────── media ─────────
const sharedCache = new Map<string, { url: string; thumbUrl: string }>();

async function renderTo(key: string, svg: string) {
  const img = sharp(Buffer.from(svg), { density: 72 });
  const main = await img.clone().resize(1280, 960).webp({ quality: 78 }).toBuffer();
  const thumb = await img.clone().resize(480, 360).webp({ quality: 70 }).toBuffer();
  await writeFileKey(`seed/${key}.webp`, main);
  await writeFileKey(`seed/${key}_t.webp`, thumb);
  await prisma.storedFile.upsert({
    where: { key: `seed/${key}.webp` },
    create: { key: `seed/${key}.webp`, mime: "image/webp", size: main.length, width: 1280, height: 960, sha256: sha256(main), visibility: "PUBLIC", purpose: "vehicle-image", originalName: `${key}.webp` },
    update: {},
  });
  return { url: `/media/seed/${key}.webp`, thumbUrl: `/media/seed/${key}_t.webp` };
}

async function vehicleImages(vcode: string, body: BodyType, colorHex: string, seed: number, luxury: boolean) {
  const scenes: Scene[] = luxury ? ["showroom", "studio"] : [pick(["studio", "coastal", "dusk", "showroom"] as Scene[]), "studio"];
  if (scenes[0] === scenes[1]) scenes[1] = "showroom";
  const a = await renderTo(`vehicles/${vcode}-1`, carSceneSvg({ kind: body, color: colorHex, scene: scenes[0], seed }));
  const b = await renderTo(`vehicles/${vcode}-2`, carSceneSvg({ kind: body, color: colorHex, scene: scenes[1], seed: seed + 1 }));
  const trim = luxury ? pick(["tan", "beige", "black"] as const) : pick(["black", "beige", "black"] as const);
  const accent = pick(["#4cc3ff", "#ff7a45", "#7ee0b5"]);
  const ik = `interior-${trim}-${accent.slice(1)}`;
  if (!sharedCache.has(ik)) sharedCache.set(ik, await renderTo(`shared/${ik}`, interiorSvg({ seed: hashString(ik), trim, accent })));
  const wk = `wheel-${colorHex.slice(1)}-${seed % 3}`;
  if (!sharedCache.has(wk)) sharedCache.set(wk, await renderTo(`shared/${wk}`, wheelDetailSvg({ color: colorHex, seed })));
  return [a, b, sharedCache.get(ik)!, sharedCache.get(wk)!];
}

async function placeholderPdf(title: string, lines: string[]) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  page.drawText("DEMO DOCUMENT", { x: 48, y: 790, size: 10, font: bold, color: rgb(0.9, 0.35, 0.1) });
  page.drawText(title, { x: 48, y: 760, size: 20, font: bold });
  lines.forEach((l, i) => page.drawText(l, { x: 48, y: 720 - i * 18, size: 12, font }));
  return Buffer.from(await doc.save());
}

async function privateFile(ownerId: string, purpose: string, name: string, title: string, lines: string[]) {
  const data = await placeholderPdf(title, lines);
  const key = `${purpose}/seed/${slugify(name)}-${code()}.pdf`;
  await writeFileKey(key, data);
  return prisma.storedFile.create({ data: { ownerId, key, mime: "application/pdf", size: data.length, sha256: sha256(data), visibility: "PRIVATE", originalName: `${name}.pdf`, purpose } });
}

// ───────── main ─────────
async function main() {
  const t0 = Date.now();
  console.log("Resetting database…");
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await fs.rm(path.join(STORAGE, "seed"), { recursive: true, force: true });

  // Roles & permissions
  console.log("Roles & permissions…");
  const perms = new Map<string, string>();
  for (const [key, description] of Object.entries(PERMISSIONS)) perms.set(key, (await prisma.permission.create({ data: { key, description } })).id);
  const roles: Record<string, string> = {};
  const roleNames: Record<string, [string, string]> = {
    SUPER_ADMIN: ["Super Admin", "Full platform access"],
    ADMIN: ["Admin", "Operations: dealers, vehicles, auctions, payments, disputes, content"],
    DEALER: ["Dealer", "Verified dealership user — buy & sell"],
    INDIVIDUAL_BUYER: ["Individual Buyer", "Retail buyer (disabled until enabled in settings)"],
  };
  for (const [key, list] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const r = await prisma.role.create({ data: { key, name: roleNames[key][0], description: roleNames[key][1], permissions: { create: list.map((p) => ({ permissionId: perms.get(p)! })) } } });
    roles[key] = r.id;
  }

  // Plans & fees
  console.log("Plans & fee rules…");
  const free = await prisma.subscriptionPlan.create({ data: { code: "FREE", name: "Free", priceMonthly: 0, listingLimit: 10, features: ["Up to 10 active listings", "Standard seller fee (1%)", "Bid & buy across India"], sortOrder: 0 } });
  const pro = await prisma.subscriptionPlan.create({ data: { code: "PRO", name: "Pro", priceMonthly: 2999, listingLimit: 50, featuredCredits: 2, analytics: true, features: ["Up to 50 active listings", "Reduced seller fee (0.75%)", "No listing fee", "Listing analytics"], sortOrder: 1 } });
  const premium = await prisma.subscriptionPlan.create({
    data: { code: "PREMIUM", name: "Premium", priceMonthly: 7999, listingLimit: null, featuredCredits: 8, analytics: true, advancedAnalytics: true, prioritySupport: true, features: ["Unlimited listings", "Lowest seller fee (0.5%)", "8 featured listings / month", "Advanced analytics", "Priority support"], sortOrder: 2 },
  });
  await prisma.fee.create({ data: { code: "BUYER_PLATFORM_FEE", name: "Buyer platform fee", payer: "BUYER", trigger: "TRANSACTION", sortOrder: 1, description: "Percentage of vehicle price charged to the buyer", rules: { create: [{ calcType: "PERCENT", rateBps: 50, minAmount: 500, maxAmount: 25000, gstApplicable: true }] } } });
  await prisma.fee.create({ data: { code: "PROCESSING_FEE", name: "Processing fee", payer: "BUYER", trigger: "TRANSACTION", sortOrder: 2, description: "Fixed fee per transaction (documentation & payment processing)", rules: { create: [{ calcType: "FIXED", fixedAmount: 1000, gstApplicable: true }] } } });
  await prisma.fee.create({
    data: {
      code: "SELLER_TRANSACTION_FEE",
      name: "Seller platform fee",
      payer: "SELLER",
      trigger: "TRANSACTION",
      sortOrder: 3,
      description: "Percentage of sale value charged to the seller on successful sales",
      rules: {
        create: [
          { calcType: "PERCENT", rateBps: 100, minAmount: 1000, gstApplicable: false },
          { calcType: "PERCENT", rateBps: 75, minAmount: 1000, gstApplicable: false, planId: pro.id },
          { calcType: "PERCENT", rateBps: 50, minAmount: 1000, gstApplicable: false, planId: premium.id },
        ],
      },
    },
  });
  await prisma.fee.create({ data: { code: "LISTING_FEE", name: "Listing fee", payer: "SELLER", trigger: "LISTING", sortOrder: 4, description: "Charged per vehicle listing", rules: { create: [{ calcType: "FIXED", fixedAmount: 499, gstApplicable: true }, { calcType: "FIXED", fixedAmount: 0, gstApplicable: false, planId: pro.id }, { calcType: "FIXED", fixedAmount: 0, gstApplicable: false, planId: premium.id }] } } });
  await prisma.fee.create({ data: { code: "AUCTION_FEE", name: "Auction fee", payer: "SELLER", trigger: "AUCTION", enabled: false, sortOrder: 5, description: "Optional charge for running an auction (disabled by default)", rules: { create: [{ calcType: "FIXED", fixedAmount: 299, gstApplicable: true }] } } });
  await prisma.fee.create({ data: { code: "FEATURED_LISTING", name: "Featured listing", payer: "SELLER", trigger: "FEATURED", sortOrder: 6, description: "Homepage & top-of-search placement for 7 days", rules: { create: [{ calcType: "FIXED", fixedAmount: 999, gstApplicable: true }] } } });

  // Locations
  console.log("Locations…");
  const districtByName = new Map<string, { id: string; stateId: string; name: string; cities: { id: string; name: string; pincode: string | null }[] }>();
  for (const s of STATES) {
    const st = await prisma.state.create({ data: { name: s.name, code: s.code, slug: slugify(s.name), priority: s.priority ?? 0 } });
    for (const d of s.districts) {
      const dist = await prisma.district.create({ data: { stateId: st.id, name: d.name, slug: slugify(d.name) } });
      const cities = [];
      for (const [cn, pin] of d.cities) cities.push(await prisma.city.create({ data: { districtId: dist.id, name: cn, slug: slugify(cn), pincode: pin } }));
      districtByName.set(d.name, { id: dist.id, stateId: st.id, name: d.name, cities });
    }
  }
  const keralaDistricts = STATES[0].districts.map((d) => districtByName.get(d.name)!);

  // Catalog
  console.log("Catalog…");
  type CatModel = { makeId: string; makeName: string; luxury: boolean; popular: boolean; modelId: string; modelName: string; body: BodyType; variants: { id: string; name: string; fuel: FuelType; trans: Transmission; price: number }[] };
  const catalog: CatModel[] = [];
  for (const mk of CATALOG) {
    const make = await prisma.make.create({ data: { name: mk.name, slug: slugify(mk.name), isLuxury: !!mk.luxury, popular: !!mk.popular } });
    for (const md of mk.models) {
      const model = await prisma.model.create({ data: { makeId: make.id, name: md.name, slug: slugify(md.name), bodyType: md.body } });
      const variants = [];
      for (const [name, fuel, trans, price] of md.variants) {
        const v = await prisma.variant.create({ data: { modelId: model.id, name, fuel, transmission: trans } });
        variants.push({ id: v.id, name, fuel, trans, price });
      }
      catalog.push({ makeId: make.id, makeName: make.name, luxury: !!mk.luxury, popular: !!mk.popular, modelId: model.id, modelName: md.name, body: md.body, variants });
    }
  }

  // Users & dealers
  console.log("Users & dealers…");
  const adminPw = await hashPassword("Admin@123");
  const demoPw = await hashPassword("Demo@1234");
  const superAdmin = await prisma.user.create({ data: { name: "Anjali Krishnan", email: "admin@autobidx.in", phone: "9000000001", passwordHash: adminPw, roleId: roles.SUPER_ADMIN, emailVerifiedAt: ago(200 * D), phoneVerifiedAt: ago(200 * D) } });
  const opsAdmin = await prisma.user.create({ data: { name: "Rahul Menon", email: "ops@autobidx.in", phone: "9000000002", passwordHash: adminPw, roleId: roles.ADMIN, emailVerifiedAt: ago(150 * D), phoneVerifiedAt: ago(150 * D) } });

  type SeedDealer = { id: string; name: string; ownerId: string; districtId: string; stateId: string; cityName: string; pincode: string; status: string; planId: string; gstin: string };
  const dealers: SeedDealer[] = [];
  for (let i = 0; i < DEALER_NAMES.length; i++) {
    const [name, distName, cityName] = DEALER_NAMES[i];
    const dist = districtByName.get(distName)!;
    const city = dist.cities.find((c) => c.name === cityName) ?? dist.cities[0];
    const status = i === 19 ? "UNDER_REVIEW" : i === 20 ? "PENDING" : i === 21 ? "SUSPENDED" : "VERIFIED";
    const isSeller = i === 0;
    const isBuyer = i === 1;
    const owner = await prisma.user.create({
      data: {
        name: isSeller ? "Joseph Kurian" : isBuyer ? "Lakshmi Nair" : `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        email: isSeller ? "seller@autobidx.in" : isBuyer ? "buyer@autobidx.in" : `dealer${i + 1}@autobidx.in`,
        phone: `98${String(47000000 + i * 1371).padStart(8, "0")}`,
        passwordHash: demoPw,
        roleId: roles.DEALER,
        emailVerifiedAt: status === "PENDING" ? null : ago(between(30, 400) * D),
        phoneVerifiedAt: status === "PENDING" ? null : ago(between(30, 400) * D),
        signupIp: `10.0.${i}.${between(2, 250)}`,
        createdAt: ago(between(60, 420) * D),
        lastLoginAt: ago(between(0, 72) * H),
      },
    });
    const stateCode = STATES.find((s) => s.districts.some((d) => d.name === distName))!.code;
    const gstStateNum = { KL: "32", KA: "29", TN: "33", TS: "36", MH: "27" }[stateCode] ?? "32";
    const pan = `${"ABCDEFGHJK"[i % 10]}${"KLMNPQRSTU"[(i * 3) % 10]}${"VWXYZABCDE"[(i * 7) % 10]}P${"FGHJK"[i % 5]}${String(1000 + i * 37).slice(-4)}${"LMNPQ"[i % 5]}`;
    const gstin = `${gstStateNum}${pan}1Z${(i % 9) + 1}`;
    const createdAt = owner.createdAt;
    const planId = i === 0 ? pro.id : i === 15 || i === 16 ? premium.id : i % 5 === 3 ? pro.id : free.id;
    const dealer = await prisma.dealer.create({
      data: {
        slug: `${slugify(name)}-${slugify(cityName)}`,
        name,
        businessType: pick(["PROPRIETORSHIP", "PARTNERSHIP", "PRIVATE_LIMITED", "LLP"] as const),
        gstin,
        pan,
        addressLine: `${between(1, 99)}/${between(100, 999)}, ${pick(["NH 66 Bypass", "MC Road", "Main Road", "Market Road", "Bank Road", "Station Road", "Seaport-Airport Road"])}`,
        stateId: dist.stateId,
        districtId: dist.id,
        cityId: city.id,
        pincode: city.pincode ?? "682001",
        status: status as "VERIFIED",
        statusReason: status === "SUSPENDED" ? "Repeated failure to hand over vehicles after payment (under review)" : null,
        verifiedAt: status === "VERIFIED" || status === "SUSPENDED" ? new Date(createdAt.getTime() + 2 * D) : null,
        description:
          i === 0
            ? "Kochi's trusted pre-owned car partner since 2009. 300+ certified cars sold every year, specialising in SUVs and family MUVs with full service history."
            : `${name} is a ${cityName}-based used-car dealership dealing in quality pre-owned hatchbacks, sedans and SUVs.`,
        createdAt,
        members: { create: { userId: owner.id, role: "OWNER" } },
        subscriptions: { create: { planId, status: "ACTIVE", startAt: createdAt, endAt: planId === free.id ? null : ahead(between(5, 25) * D) } },
      },
    });
    // KYC
    const kycDocs: { type: "PAN_CARD" | "GST_CERTIFICATE" | "REGISTRATION_CERTIFICATE" | "ADDRESS_PROOF" | "CANCELLED_CHEQUE"; fileId: string }[] = [];
    if (i <= 1 || status === "UNDER_REVIEW") {
      for (const t of ["PAN_CARD", "GST_CERTIFICATE", "REGISTRATION_CERTIFICATE", "ADDRESS_PROOF", "CANCELLED_CHEQUE"] as const) {
        const f = await privateFile(owner.id, "kyc", `${name} ${t}`, t.replace(/_/g, " "), [name, `PAN: ${pan}`, `GSTIN: ${gstin}`, "Uploaded for KYC verification (demo)."]);
        kycDocs.push({ type: t, fileId: f.id });
      }
    }
    if (status !== "PENDING") {
      const acct = `${between(1000, 9999)}${between(10000000, 99999999)}`;
      await prisma.kycSubmission.create({
        data: {
          dealerId: dealer.id,
          status: status === "UNDER_REVIEW" ? "SUBMITTED" : "APPROVED",
          pan,
          gstin,
          bankAccountName: name,
          bankAccountEnc: encryptField(acct),
          bankAccountLast4: acct.slice(-4),
          bankIfsc: pick(["FDRL0001234", "SBIN0070123", "HDFC0001765", "ICIC0000456", "CSBK0000210"]),
          bankName: pick(["Federal Bank", "State Bank of India", "HDFC Bank", "ICICI Bank", "CSB Bank"]),
          authorizedName: owner.name,
          authorizedDesignation: "Proprietor",
          authorizedPan: pan,
          authorizedPhone: owner.phone,
          submittedAt: new Date(createdAt.getTime() + D),
          reviewedAt: status === "UNDER_REVIEW" ? null : new Date(createdAt.getTime() + 2 * D),
          reviewerId: status === "UNDER_REVIEW" ? null : opsAdmin.id,
          documents: { create: kycDocs.map((d) => ({ type: d.type, fileId: d.fileId, verified: status !== "UNDER_REVIEW" })) },
        },
      });
    }
    dealers.push({ id: dealer.id, name, ownerId: owner.id, districtId: dist.id, stateId: dist.stateId, cityName: city.name, pincode: city.pincode ?? "682001", status, planId, gstin });
  }
  // A second team member for the demo seller
  const staff = await prisma.user.create({ data: { name: "Vinod Pillai", email: "staff@autobidx.in", phone: "9847099999", passwordHash: demoPw, roleId: roles.DEALER, emailVerifiedAt: ago(40 * D) } });
  await prisma.dealerUser.create({ data: { dealerId: dealers[0].id, userId: staff.id, role: "STAFF", canBid: false, canList: true } });

  const verified = dealers.filter((d) => d.status === "VERIFIED");
  const demoSeller = dealers[0];
  const demoBuyer = dealers[1];
  const fees = await loadFees(prisma);
  const planOf = new Map(dealers.map((d) => [d.id, d.planId]));

  // ───────── Vehicles ─────────
  console.log("Vehicles & images (this takes a minute)…");
  const colorNames = Object.keys(PAINT_COLORS);
  type Plan = { kind: "published" | "live" | "scheduled" | "ended_rnm" | "ended_nobids" | "pending" | "draft" | "sold" | "reserved"; dealer: SeedDealer; buyNow?: boolean; luxury?: boolean; endIn?: number };
  const plans: Plan[] = [];
  const otherSellers = verified.filter((d) => d.id !== demoBuyer.id);
  const sellerFor = (i: number) => (i % 6 === 0 ? demoSeller : otherSellers[i % otherSellers.length]);
  for (let i = 0; i < 58; i++) plans.push({ kind: "published", dealer: sellerFor(i), buyNow: i % 3 !== 1, luxury: i % 9 === 4 });
  const liveEnds = [3.5 * 60_000, 9 * 60_000, 18 * 60_000, 40 * 60_000, 1.2 * H, 2 * H, 3 * H, 4.5 * H, 6 * H, 8 * H, 11 * H, 14 * H, 18 * H, 22 * H, 26 * H, 30 * H, 36 * H, 44 * H, 52 * H, 60 * H, 70 * H, 3.5 * D];
  liveEnds.forEach((endIn, i) => plans.push({ kind: "live", dealer: i % 4 === 0 ? demoSeller : otherSellers[(i * 5) % otherSellers.length], endIn, buyNow: i % 3 === 0, luxury: i % 5 === 2 }));
  for (let i = 0; i < 3; i++) plans.push({ kind: "scheduled", dealer: otherSellers[(i * 7 + 2) % otherSellers.length], endIn: (i + 1) * 10 * H });
  plans.push({ kind: "ended_rnm", dealer: demoSeller }, { kind: "ended_rnm", dealer: otherSellers[4] }, { kind: "ended_nobids", dealer: otherSellers[6] }, { kind: "ended_nobids", dealer: demoSeller });
  for (let i = 0; i < 6; i++) plans.push({ kind: "pending", dealer: i < 2 ? demoSeller : otherSellers[(i * 3) % otherSellers.length] });
  for (let i = 0; i < 3; i++) plans.push({ kind: "draft", dealer: demoSeller });
  for (let i = 0; i < 32; i++) plans.push({ kind: "sold", dealer: i % 5 === 0 ? demoSeller : otherSellers[(i * 3 + 1) % otherSellers.length], luxury: i % 7 === 3 });
  for (let i = 0; i < 6; i++) plans.push({ kind: "reserved", dealer: i % 2 === 0 ? demoSeller : otherSellers[(i * 2 + 5) % otherSellers.length] });

  type SeedVehicle = { id: string; code: string; title: string; dealerId: string; price: number; plan: Plan; createdAt: Date; reserve: number | null; minBid: number; increment: number };
  const vehicles: SeedVehicle[] = [];
  const luxuryModels = catalog.filter((c) => c.luxury);
  const massModels = catalog.filter((c) => !c.luxury);
  for (let idx = 0; idx < plans.length; idx++) {
    const plan = plans[idx];
    const m = plan.luxury ? pick(luxuryModels) : rand() < 0.65 ? pick(massModels.filter((c) => c.popular)) : pick(massModels);
    const variant = pick(m.variants);
    const year = between(m.luxury ? 2016 : 2014, 2024);
    const age = 2026 - year;
    const km = Math.max(3000, round(age * between(7000, 14000) + between(-3000, 6000), 100));
    const owners = age > 7 ? between(1, 3) : age > 3 ? between(1, 2) : 1;
    const colorName = pick(colorNames);
    const depreciation = Math.pow(m.luxury ? 0.86 : 0.885, age) * (1 - Math.min(0.12, km / 1_500_000));
    const expectedPrice = round(variant.price * depreciation * (0.95 + rand() * 0.1), 5000);
    const dist = rand() < 0.8 ? districtByName.get(plan.dealer.districtId ? [...districtByName.values()].find((d) => d.id === plan.dealer.districtId)!.name : "Ernakulam")! : pick(keralaDistricts);
    const city = dist.cities.find((c) => c.name === plan.dealer.cityName) ?? pick(dist.cities);
    const stateCode = STATES.find((s) => s.districts.some((d) => d.name === dist.name))!.code;
    const reg = `${stateCode}${String(between(1, 70)).padStart(2, "0")}${pick(["A", "B", "C", "D", "E", "F", "AB", "AC", "BD", "CX", "DM", "Q", "R", "S", "U", "Z"])}${between(1000, 9999)}`;
    const createdAt = plan.kind === "sold" ? ago(between(15, 330) * D) : plan.kind === "published" ? ago(between(1, 45) * D) : ago(between(1, 6) * D);
    const vcode = code();
    const title = `${year} ${m.makeName} ${m.modelName} ${variant.name}`;
    const auctionLike = ["live", "scheduled", "ended_rnm", "ended_nobids"].includes(plan.kind) || (plan.kind === "sold" && rand() < 0.55) || (plan.kind === "reserved" && rand() < 0.5);
    const reserve = auctionLike ? round(expectedPrice * (0.9 + rand() * 0.08), 5000) : null;
    const minBid = round(expectedPrice * (0.72 + rand() * 0.1), 5000);
    const increment = expectedPrice < 300000 ? 2000 : expectedPrice < 1000000 ? 5000 : expectedPrice < 2500000 ? 10000 : 25000;
    const accident = rand() < 0.08;
    const cond = accident ? "FAIR" : pick(["EXCELLENT", "GOOD", "GOOD", "EXCELLENT", "GOOD", "FAIR"] as const);
    const seed = hashString(vcode);
    const imgs = await vehicleImages(vcode, m.body, PAINT_COLORS[colorName], seed, m.luxury);
    const status =
      plan.kind === "published" ? "PUBLISHED" : plan.kind === "live" ? "AUCTION_LIVE" : plan.kind === "scheduled" ? "PUBLISHED" : plan.kind.startsWith("ended") ? "AUCTION_ENDED" : plan.kind === "pending" ? "PENDING_APPROVAL" : plan.kind === "draft" ? "DRAFT" : plan.kind === "sold" ? "SOLD" : "RESERVED";
    const buyNow = (plan.buyNow ?? false) && status !== "SOLD";
    const views = plan.kind === "draft" || plan.kind === "pending" ? 0 : between(40, 900);
    const v = await prisma.vehicle.create({
      data: {
        code: vcode,
        dealerId: plan.dealer.id,
        createdById: plan.dealer.ownerId,
        makeId: m.makeId,
        modelId: m.modelId,
        variantId: variant.id,
        variantName: variant.name,
        title,
        description: `${owners === 1 ? "Single-owner" : `${owners}-owner`} ${m.modelName} in ${colorName.toLowerCase()}, ${variant.fuel.toLowerCase()} ${variant.trans === "MANUAL" ? "manual" : "automatic"}. ${pick(["Company-serviced with complete records.", "Well maintained, new tyres fitted recently.", "Garage kept, no major repairs.", "Comprehensive insurance valid, clean RC.", "Touch-up paint on rear bumper; mechanically sound."])} ${accident ? "Minor accident repair on front bumper (documented)." : "No accident history."}`,
        bodyType: m.body,
        year,
        registrationYear: Math.min(2025, year + (rand() < 0.2 ? 1 : 0)),
        registrationNumber: reg,
        vin: `MA${pick(["1", "3", "L", "T"])}${Array.from({ length: 14 }, () => "ABCDEFGHJKLMNPRSTUVWXYZ0123456789"[between(0, 32)]).join("")}`,
        engineNumber: `${pick(["K12M", "G4LA", "D20", "1NR", "L15B", "M15A"])}${between(100000, 999999)}`,
        fuel: variant.fuel,
        transmission: variant.trans,
        kmDriven: km,
        color: colorName,
        owners,
        insuranceStatus: pick(["COMPREHENSIVE", "ZERO_DEP", "COMPREHENSIVE", "THIRD_PARTY"] as const),
        insuranceExpiry: ahead(between(20, 330) * D),
        rcStatus: rand() < 0.15 ? "HYPOTHECATED" : "ORIGINAL",
        stateId: dist.stateId,
        districtId: dist.id,
        cityId: city.id,
        cityName: city.name,
        pincode: city.pincode ?? plan.dealer.pincode,
        overallCondition: cond,
        accidentHistory: accident,
        floodDamage: false,
        engineCondition: cond === "FAIR" ? "GOOD" : cond,
        gearboxCondition: pick(["EXCELLENT", "GOOD"] as const),
        tyreCondition: pick(["EXCELLENT", "GOOD", "FAIR"] as const),
        batteryCondition: pick(["EXCELLENT", "GOOD"] as const),
        serviceHistory: pick(["FULL", "FULL", "PARTIAL"]),
        expectedPrice,
        reservePrice: reserve,
        minimumBid: auctionLike ? minBid : null,
        buyNowPrice: buyNow ? round(expectedPrice * 1.06, 5000) : null,
        buyNowEnabled: buyNow,
        offersEnabled: true,
        sellerMargin: round(expectedPrice * 0.06, 1000),
        auctionEnabled: auctionLike,
        bidIncrement: auctionLike ? increment : null,
        reserveVisible: auctionLike && rand() < 0.35,
        status,
        featuredUntil: (plan.kind === "published" || plan.kind === "live") && rand() < 0.16 ? ahead(between(1, 6) * D) : null,
        viewCount: views,
        watchCount: Math.floor(views / between(12, 30)),
        enquiryCount: between(0, 6),
        searchText: [m.makeName, m.modelName, variant.name, city.name, dist.name, colorName, variant.fuel, variant.trans, m.body, year].join(" ").toLowerCase(),
        publishedAt: ["DRAFT", "PENDING_APPROVAL"].includes(status) ? null : createdAt,
        createdAt,
        images: { create: imgs.map((im, k) => ({ kind: "PHOTO" as const, url: im.url, thumbUrl: im.thumbUrl, width: 1280, height: 960, alt: `${title} — photo ${k + 1}`, sortOrder: k })) },
      },
    });
    vehicles.push({ id: v.id, code: vcode, title, dealerId: plan.dealer.id, price: expectedPrice, plan, createdAt, reserve, minBid, increment });
    if ((idx + 1) % 20 === 0) console.log(`  ${idx + 1}/${plans.length} vehicles`);
  }

  // Inspections (~45% of non-draft vehicles)
  console.log("Inspections…");
  for (const v of vehicles) {
    if (["draft", "pending"].includes(v.plan.kind) || rand() > 0.45) continue;
    const items = INSPECTION_CHECKLIST.map((c) => ({ key: c.key, label: c.label, rating: c.key === "accident" || c.key === "flood" ? between(8, 10) : between(6, 10), notes: c.key === "tyres" && rand() < 0.4 ? "Rear tyres ~40% tread" : undefined }));
    const score = inspectionScore(items);
    await prisma.vehicleInspection.create({
      data: { vehicleId: v.id, status: "COMPLETED", inspectorName: pick(["AutoBidX Assured — Kochi", "AutoBidX Assured — Thrissur", "CarCheck Partners", "AutoBidX Assured — Kozhikode"]), inspectedAt: new Date(v.createdAt.getTime() + D), score, checklist: items, summary: score >= 85 ? "Very well maintained vehicle. No structural issues found; minor cosmetic wear consistent with age." : "Mechanically sound. Some cosmetic marks and wear items due for replacement at next service.", odometerVerified: true },
    });
    await prisma.vehicle.update({ where: { id: v.id }, data: { inspectionScore: score, inspectionVerified: true } });
  }

  // ───────── Auctions & bids ─────────
  console.log("Auctions & bids…");
  const bidderPool = (sellerId: string) => verified.filter((d) => d.id !== sellerId);
  let totalBids = 0;
  async function seedBids(auctionId: string, v: SeedVehicle, startAt: Date, until: Date, count: number, cap: number | null) {
    const pool = bidderPool(v.dealerId);
    let amount = v.minBid;
    let last: SeedDealer | null = null;
    const span = until.getTime() - startAt.getTime();
    const bids: { bidder: SeedDealer; amount: number; at: Date }[] = [];
    for (let k = 0; k < count; k++) {
      let bidder = pick(pool);
      if (k > 0 && rand() < 0.25 && pool.includes(demoBuyer) && demoBuyer.id !== v.dealerId) bidder = demoBuyer;
      if (last && bidder.id === last.id) bidder = pool[(pool.indexOf(bidder) + 1) % pool.length];
      if (k > 0) amount += v.increment * (rand() < 0.7 ? 1 : between(2, 4));
      if (cap && amount > cap) break;
      bids.push({ bidder, amount, at: new Date(startAt.getTime() + (span * (k + 1)) / (count + 1) + between(0, 60_000)) });
      last = bidder;
    }
    for (const b of bids) await prisma.bid.create({ data: { auctionId, bidderId: b.bidder.ownerId, dealerId: b.bidder.id, amount: b.amount, isAuto: rand() < 0.15, createdAt: b.at } });
    totalBids += bids.length;
    return bids;
  }

  for (const v of vehicles) {
    const k = v.plan.kind;
    if (!["live", "scheduled", "ended_rnm", "ended_nobids"].includes(k)) continue;
    if (k === "scheduled") {
      const startAt = ahead(v.plan.endIn!);
      const endAt = new Date(startAt.getTime() + 24 * H);
      const a = await prisma.auction.create({ data: { vehicleId: v.id, status: "SCHEDULED", startAt, endAt, originalEndAt: endAt, startingBid: v.minBid, reservePrice: v.reserve, bidIncrement: v.increment, extendTriggerSec: 120, extendBySec: 120 } });
      await prisma.vehicle.update({ where: { id: v.id }, data: { liveAuctionId: a.id, auctionStartAt: startAt, auctionEndAt: endAt } });
      continue;
    }
    if (k === "live") {
      const startAt = ago(between(3, 40) * H);
      const endAt = ahead(v.plan.endIn!);
      const reserveVisible = rand() < 0.35;
      const a = await prisma.auction.create({ data: { vehicleId: v.id, status: "LIVE", startAt, endAt, originalEndAt: endAt, startingBid: v.minBid, reservePrice: v.reserve, reserveVisible, bidIncrement: v.increment, extendTriggerSec: 120, extendBySec: 120 } });
      const bids = await seedBids(a.id, v, startAt, ago(between(1, 30) * 60_000), between(3, 13), v.reserve ? Math.round(v.reserve * 1.08) : null);
      const top = bids[bids.length - 1];
      const bidderCount = new Set(bids.map((b) => b.bidder.id)).size;
      await prisma.auction.update({ where: { id: a.id }, data: { currentBid: top?.amount ?? null, currentBidderId: top?.bidder.ownerId ?? null, bidCount: bids.length, bidderCount } });
      await prisma.vehicle.update({ where: { id: v.id }, data: { liveAuctionId: a.id, currentBid: top?.amount ?? null, bidCount: bids.length, auctionStartAt: startAt, auctionEndAt: endAt, reserveVisible } });
      // A competing proxy bid from another dealer on some auctions (demo of auto-bidding)
      if (top && rand() < 0.4) {
        const proxy = bidderPool(v.dealerId).find((d) => d.id !== top.bidder.id && d.id !== demoBuyer.id)!;
        await prisma.autoBid.create({ data: { auctionId: a.id, userId: proxy.ownerId, dealerId: proxy.id, maxAmount: top.amount + v.increment * between(2, 6) } });
      }
      continue;
    }
    // ended
    const endAt = ago(between(2, 20) * H);
    const startAt = new Date(endAt.getTime() - 24 * H);
    const a = await prisma.auction.create({ data: { vehicleId: v.id, status: "ENDED", startAt, endAt, originalEndAt: endAt, startingBid: v.minBid, reservePrice: v.reserve, bidIncrement: v.increment, extendTriggerSec: 120, extendBySec: 120, closedAt: endAt, result: k === "ended_rnm" ? "RESERVE_NOT_MET" : "NO_BIDS" } });
    let top: { amount: number; bidder: SeedDealer } | undefined;
    let count = 0;
    if (k === "ended_rnm") {
      const bids = await seedBids(a.id, v, startAt, endAt, between(3, 6), Math.round((v.reserve ?? v.price) * 0.97));
      top = bids[bids.length - 1];
      count = bids.length;
    }
    await prisma.auction.update({ where: { id: a.id }, data: { currentBid: top?.amount ?? null, currentBidderId: top?.bidder.ownerId ?? null, bidCount: count } });
    await prisma.vehicle.update({ where: { id: v.id }, data: { liveAuctionId: a.id, currentBid: top?.amount ?? null, bidCount: count, auctionStartAt: startAt, auctionEndAt: endAt } });
  }

  // ───────── Orders ─────────
  console.log("Orders, payments & documents…");
  const FLOW: OrderStatus[] = ["PAYMENT_PENDING", "PAYMENT_RECEIVED", "SELLER_CONFIRMED", "DOCUMENTS_PENDING", "VEHICLE_READY", "IN_DELIVERY", "COMPLETED"];
  let invSeq = 100;
  async function createOrder(v: SeedVehicle, buyer: SeedDealer, price: number, status: OrderStatus, createdAt: Date, source: "AUCTION" | "BUY_NOW" | "OFFER", auctionId?: string) {
    const fb = calculateTransactionFees(price, fees, { buyerPlanId: planOf.get(buyer.id) ?? null, sellerPlanId: planOf.get(v.dealerId) ?? null, defaultGstBps: 1800 });
    const reached = status === "DISPUTED" ? FLOW.indexOf("VEHICLE_READY") : FLOW.indexOf(status);
    const paid = reached >= 1;
    const items: Prisma.OrderItemCreateWithoutOrderInput[] = [
      { code: "VEHICLE", description: `Vehicle price — ${v.title}`, payer: "BUYER", amount: price, sortOrder: 0 },
      ...fb.lines.map((l, i) => ({ code: l.code, description: l.name, payer: l.payer, amount: l.amount, sortOrder: 10 + i })),
    ];
    if (fb.buyer.gst) items.push({ code: "GST_BUYER", description: "GST on buyer fees", payer: "BUYER", amount: fb.buyer.gst, sortOrder: 50 });
    const history: Prisma.OrderStatusHistoryCreateWithoutOrderInput[] = [];
    for (let s = 0; s <= reached; s++) history.push({ from: s === 0 ? null : FLOW[s - 1], to: FLOW[s], createdAt: new Date(createdAt.getTime() + s * 18 * H), note: s === 0 ? (source === "AUCTION" ? "Auction won" : source === "BUY_NOW" ? "Buy Now purchase" : "Offer accepted") : undefined });
    if (status === "DISPUTED") history.push({ from: "VEHICLE_READY", to: "DISPUTED", createdAt: new Date(createdAt.getTime() + 5 * 18 * H), note: "Dispute raised" });
    const completedAt = status === "COMPLETED" ? new Date(createdAt.getTime() + 6 * 18 * H) : null;
    const docs: Prisma.DocumentCreateWithoutOrderInput[] = [
      { type: "INVOICE", generated: true, title: "Buyer tax invoice", createdAt },
      { type: "SALE_AGREEMENT", generated: true, title: "Vehicle sale agreement", createdAt },
    ];
    if (paid) docs.push({ type: "PAYMENT_RECEIPT", generated: true, title: "Payment receipt", createdAt: new Date(createdAt.getTime() + 18 * H) });
    if (reached >= FLOW.indexOf("VEHICLE_READY")) {
      const sellerDealer = dealers.find((d) => d.id === v.dealerId)!;
      const rc = await privateFile(sellerDealer.ownerId, "order-doc", `RC ${v.code}`, "Registration Certificate (copy)", [v.title, "Copy uploaded by seller (demo document)."]);
      docs.push({ type: "RC", generated: false, file: { connect: { id: rc.id } }, uploadedById: sellerDealer.ownerId, title: "RC copy", createdAt: new Date(createdAt.getTime() + 3 * 18 * H) });
    }
    if (reached >= FLOW.indexOf("IN_DELIVERY")) docs.push({ type: "DELIVERY_CHALLAN", generated: true, title: "Delivery challan", createdAt: new Date(createdAt.getTime() + 5 * 18 * H) });
    const sellerD = dealers.find((d) => d.id === v.dealerId)!;
    const order = await prisma.order.create({
      data: {
        orderNumber: `ABX-${String(createdAt.getFullYear()).slice(2)}${String(createdAt.getMonth() + 1).padStart(2, "0")}-${code().toUpperCase()}`,
        source,
        vehicleId: v.id,
        auctionId,
        buyerId: buyer.ownerId,
        buyerDealerId: buyer.id,
        sellerDealerId: v.dealerId,
        winningBid: source === "AUCTION" ? price : null,
        vehiclePrice: price,
        buyerFee: fb.buyer.fees,
        sellerFee: fb.seller.fees,
        gstAmount: fb.buyer.gst,
        sellerGstAmount: fb.seller.gst,
        buyerTotal: fb.buyer.total,
        sellerNet: fb.seller.net,
        feeBreakdown: fb as unknown as Prisma.InputJsonValue,
        status,
        paymentStatus: paid ? "PAID" : "PENDING",
        deliveryStatus: status === "COMPLETED" ? "DELIVERED" : status === "IN_DELIVERY" ? "IN_TRANSIT" : "NOT_STARTED",
        payoutStatus: status === "COMPLETED" ? (createdAt.getTime() < now - 20 * D ? "RELEASED" : "PENDING") : paid ? "ON_HOLD" : "NOT_DUE",
        paymentDueAt: new Date(createdAt.getTime() + 48 * H),
        deliveryMode: reached >= FLOW.indexOf("IN_DELIVERY") ? pick(["PICKUP", "DELIVERY"]) : null,
        deliveryDate: reached >= FLOW.indexOf("IN_DELIVERY") ? new Date(createdAt.getTime() + 5 * 18 * H) : null,
        activeVehicleKey: v.id,
        completedAt,
        createdAt,
        items: { create: items },
        history: { create: history },
        documents: { create: docs },
        invoices: {
          create: [
            { number: `ABX-B/${String(++invSeq)}`, type: "BUYER_TAX_INVOICE", dealerId: buyer.id, billToName: buyer.name, billToGstin: buyer.gstin, lines: fb.lines.filter((l) => l.payer === "BUYER").map((l) => ({ description: l.name, amount: l.amount, gst: l.gst })), subtotal: fb.buyer.fees, gst: fb.buyer.gst, total: fb.buyer.fees + fb.buyer.gst, issuedAt: createdAt },
            { number: `ABX-S/${String(++invSeq)}`, type: "SELLER_FEE_INVOICE", dealerId: v.dealerId, billToName: sellerD.name, billToGstin: sellerD.gstin, lines: fb.lines.filter((l) => l.payer === "SELLER").map((l) => ({ description: l.name, amount: l.amount, gst: l.gst })), subtotal: fb.seller.fees, gst: fb.seller.gst, total: fb.seller.fees + fb.seller.gst, issuedAt: createdAt },
          ],
        },
      },
    });
    if (paid) {
      const method = pick(["UPI", "NETBANKING", "BANK_TRANSFER", "UPI", "CARD"] as const);
      await prisma.payment.create({
        data: { reference: ref("PAY"), purpose: "ORDER", orderId: order.id, userId: buyer.ownerId, dealerId: buyer.id, amount: fb.buyer.total, method, gateway: method === "BANK_TRANSFER" ? "bank_transfer" : "mock", gatewayOrderId: `mock_order_${code()}`, gatewayPaymentId: method === "BANK_TRANSFER" ? `UTR${between(100000000, 999999999)}` : `mock_pay_${code()}`, status: "PAID", verifiedAt: new Date(createdAt.getTime() + 18 * H), createdAt: new Date(createdAt.getTime() + 17 * H) },
      });
    }
    if (status === "COMPLETED" || paid) await prisma.vehicle.update({ where: { id: v.id }, data: { status: "SOLD", soldAt: new Date(createdAt.getTime() + 18 * H) } });
    return order;
  }

  const buyers = verified;
  const completedOrders: { id: string; buyer: SeedDealer; sellerId: string; createdAt: Date }[] = [];
  const reservedStatuses: OrderStatus[] = ["PAYMENT_RECEIVED", "PAYMENT_PENDING", "DOCUMENTS_PENDING", "IN_DELIVERY", "SELLER_CONFIRMED", "DISPUTED"];
  let resIdx = 0;
  for (const v of vehicles) {
    if (v.plan.kind !== "sold" && v.plan.kind !== "reserved") continue;
    let buyer = pick(buyers.filter((b) => b.id !== v.dealerId));
    if (v.plan.kind === "reserved" && v.dealerId !== demoBuyer.id && resIdx % 2 === 1) buyer = demoBuyer;
    if (v.plan.kind === "sold" && rand() < 0.25 && v.dealerId !== demoBuyer.id) buyer = demoBuyer;
    const price = round(v.price * (0.94 + rand() * 0.1), 5000);
    const status: OrderStatus = v.plan.kind === "sold" ? "COMPLETED" : reservedStatuses[resIdx++ % reservedStatuses.length];
    const createdAt = v.plan.kind === "sold" ? new Date(v.createdAt.getTime() + between(1, 9) * D) : status === "PAYMENT_PENDING" ? ago(between(2, 20) * H) : ago(between(30, 90) * H);
    const viaAuction = v.reserve != null;
    let auctionId: string | undefined;
    if (viaAuction) {
      const endAt = new Date(createdAt.getTime() - 60_000);
      const startAt = new Date(endAt.getTime() - 24 * H);
      const a = await prisma.auction.create({ data: { vehicleId: v.id, status: "ENDED", result: "WON", startAt, endAt, originalEndAt: endAt, startingBid: v.minBid, reservePrice: v.reserve, bidIncrement: v.increment, extendTriggerSec: 120, extendBySec: 120, closedAt: endAt, winnerId: buyer.ownerId } });
      // bids ending with the winner at the sale price
      const bids = await seedBids(a.id, v, startAt, new Date(endAt.getTime() - 5 * 60_000), between(3, 9), price - v.increment);
      await prisma.bid.create({ data: { auctionId: a.id, bidderId: buyer.ownerId, dealerId: buyer.id, amount: Math.max(price, (bids[bids.length - 1]?.amount ?? 0) + v.increment), createdAt: new Date(endAt.getTime() - 2 * 60_000) } });
      totalBids++;
      await prisma.auction.update({ where: { id: a.id }, data: { currentBid: Math.max(price, (bids[bids.length - 1]?.amount ?? 0) + v.increment), currentBidderId: buyer.ownerId, bidCount: bids.length + 1, bidderCount: new Set([...bids.map((b) => b.bidder.id), buyer.id]).size } });
      auctionId = a.id;
    }
    const finalPrice = auctionId ? (await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } })).currentBid! : price;
    const o = await createOrder(v, buyer, finalPrice, status, createdAt, viaAuction ? "AUCTION" : rand() < 0.5 ? "BUY_NOW" : "OFFER", auctionId);
    if (status === "COMPLETED") completedOrders.push({ id: o.id, buyer, sellerId: v.dealerId, createdAt });
    if (status === "DISPUTED") {
      await prisma.dispute.create({
        data: {
          number: `DSP-${code().toUpperCase()}`,
          orderId: o.id,
          raisedById: buyer.ownerId,
          raisedByParty: "BUYER",
          category: "CONDITION_MISMATCH",
          subject: "Odometer reading differs from listing",
          description: "At inspection before pickup the odometer shows ~8,000 km more than the listing stated. Requesting clarification and a price adjustment.",
          status: "INVESTIGATING",
          assigneeId: opsAdmin.id,
          previousOrderStatus: "VEHICLE_READY",
          messages: {
            create: [
              { authorId: buyer.ownerId, body: "At inspection before pickup the odometer shows ~8,000 km more than the listing stated. Requesting clarification and a price adjustment." },
              { authorId: opsAdmin.id, body: "Thanks — we've asked the seller for the latest service record to verify the odometer history.", kind: "DOCUMENT_REQUEST" },
              { authorId: opsAdmin.id, body: "Seller's last service invoice (Mar) shows 61,200 km — supports buyer's claim.", internal: true },
            ],
          },
        },
      });
    }
  }

  // Reviews on most completed orders
  console.log("Reviews, offers, watchlists, notifications…");
  const comments = ["Smooth transaction, car exactly as described.", "Documents handed over promptly. Will buy again.", "Good communication, quick delivery.", "Vehicle in great condition. Recommended dealer.", "Minor delay in RC transfer but resolved well.", "Professional and transparent throughout."];
  for (const o of completedOrders) {
    if (o.buyer.id === demoBuyer.id && o.sellerId === demoSeller.id) continue; // leave one for demo
    if (rand() < 0.8) await prisma.review.create({ data: { orderId: o.id, authorId: o.buyer.ownerId, subjectDealerId: o.sellerId, direction: "BUYER_TO_SELLER", rating: rand() < 0.75 ? 5 : 4, comment: pick(comments), createdAt: new Date(o.createdAt.getTime() + 5 * D) } });
    if (rand() < 0.5) {
      const seller = dealers.find((d) => d.id === o.sellerId)!;
      await prisma.review.create({ data: { orderId: o.id, authorId: seller.ownerId, subjectDealerId: o.buyer.id, direction: "SELLER_TO_BUYER", rating: rand() < 0.8 ? 5 : 4, comment: "Prompt payment, smooth buyer.", createdAt: new Date(o.createdAt.getTime() + 5 * D) } });
    }
  }
  // Ensure a completed demo-buyer ← demo-seller order exists for the review demo
  const demoComplete = vehicles.find((v) => v.plan.kind === "published" && v.dealerId === demoSeller.id);
  if (demoComplete) {
    const o = await createOrder(demoComplete, demoBuyer, demoComplete.price, "COMPLETED", ago(3 * D), "BUY_NOW");
    completedOrders.push({ id: o.id, buyer: demoBuyer, sellerId: demoSeller.id, createdAt: ago(3 * D) });
  }

  // Offers on demo seller's published vehicles
  const sellerPublished = vehicles.filter((v) => v.plan.kind === "published" && v.dealerId === demoSeller.id && v.id !== demoComplete?.id);
  for (let i = 0; i < Math.min(3, sellerPublished.length); i++) {
    const v = sellerPublished[i];
    const buyer = i === 0 ? demoBuyer : verified[(i * 4 + 3) % verified.length];
    if (buyer.id === demoSeller.id) continue;
    const amount = round(v.price * 0.9, 5000);
    const countered = i === 1;
    await prisma.offer.create({
      data: {
        vehicleId: v.id,
        buyerId: buyer.ownerId,
        buyerDealerId: buyer.id,
        sellerDealerId: demoSeller.id,
        amount,
        currentAmount: countered ? round(v.price * 0.96, 5000) : amount,
        awaiting: countered ? "BUYER" : "SELLER",
        status: countered ? "COUNTERED" : "PENDING",
        message: "Can close today if we agree. Payment ready.",
        rounds: countered ? 2 : 1,
        expiresAt: ahead(between(20, 44) * H),
        createdAt: ago(between(2, 10) * H),
        counters: { create: countered ? [{ by: "BUYER", amount, message: "Can close today." }, { by: "SELLER", amount: round(v.price * 0.96, 5000), message: "Best I can do — new tyres fitted last month." }] : [{ by: "BUYER", amount, message: "Can close today if we agree." }] },
      },
    });
  }
  // Demo buyer's offer on someone else's car
  const otherPublished = vehicles.find((v) => v.plan.kind === "published" && v.dealerId !== demoBuyer.id && v.dealerId !== demoSeller.id);
  if (otherPublished) {
    await prisma.offer.create({ data: { vehicleId: otherPublished.id, buyerId: demoBuyer.ownerId, buyerDealerId: demoBuyer.id, sellerDealerId: otherPublished.dealerId, amount: round(otherPublished.price * 0.88, 5000), currentAmount: round(otherPublished.price * 0.95, 5000), awaiting: "BUYER", status: "COUNTERED", rounds: 2, expiresAt: ahead(30 * H), counters: { create: [{ by: "BUYER", amount: round(otherPublished.price * 0.88, 5000) }, { by: "SELLER", amount: round(otherPublished.price * 0.95, 5000), message: "Counter — includes 1-year extended warranty." }] } } });
  }

  // Watchlists
  const liveVehicles = vehicles.filter((v) => v.plan.kind === "live" && v.dealerId !== demoBuyer.id);
  for (const v of [...liveVehicles.slice(0, 5), ...vehicles.filter((x) => x.plan.kind === "published" && x.dealerId !== demoBuyer.id).slice(0, 3)]) {
    await prisma.watchlist.create({ data: { userId: demoBuyer.ownerId, vehicleId: v.id } });
  }

  // Listing fee charges for the demo seller (one pending, one paid)
  const pendingV = vehicles.find((v) => v.plan.kind === "pending" && v.dealerId === demoSeller.id);
  if (pendingV) await prisma.payment.create({ data: { reference: ref("PAY"), purpose: "LISTING_FEE", userId: demoSeller.ownerId, dealerId: demoSeller.id, amount: 589, gateway: "pending", targetId: pendingV.id, status: "PENDING" } });
  const subPay = await prisma.payment.create({ data: { reference: ref("PAY"), purpose: "SUBSCRIPTION", userId: demoSeller.ownerId, dealerId: demoSeller.id, amount: 3539, method: "UPI", gateway: "mock", gatewayOrderId: "mock_order_sub1", gatewayPaymentId: "mock_pay_sub1", status: "PAID", targetId: pro.id, verifiedAt: ago(12 * D), createdAt: ago(12 * D) } });
  await prisma.invoice.create({ data: { number: `ABX-SV/${++invSeq}`, type: "SERVICE_INVOICE", paymentId: subPay.id, dealerId: demoSeller.id, billToName: demoSeller.name, billToGstin: demoSeller.gstin, lines: [{ description: "Pro subscription (30 days)", amount: 2999, gst: 540 }], subtotal: 2999, gst: 540, total: 3539, issuedAt: ago(12 * D) } });

  // Notifications for demo users
  const notes: [string, string, string, string, string][] = [
    [demoBuyer.ownerId, "OUTBID", "You've been outbid", "A higher bid was placed on a vehicle you're bidding on.", "/dashboard/bids"],
    [demoBuyer.ownerId, "AUCTION_WON", "Congratulations — you won!", "Complete payment within 48 hours to secure your vehicle.", "/dashboard/orders"],
    [demoBuyer.ownerId, "COUNTER_OFFER", "Counter-offer received", "A seller countered your offer.", "/dashboard/offers"],
    [demoBuyer.ownerId, "KYC_APPROVED", "Your dealership is verified 🎉", "You can now bid, buy and sell on AutoBidX.", "/dashboard"],
    [demoSeller.ownerId, "OFFER_RECEIVED", "New offer received", "Pooram Auto Hub made an offer on one of your vehicles.", "/dashboard/offers"],
    [demoSeller.ownerId, "NEW_BID", "New bid on your vehicle", "Your live auction received a new bid.", "/dashboard/auctions"],
    [demoSeller.ownerId, "PAYMENT_RECEIVED", "Payment received", "A buyer's payment was verified — confirm the sale to proceed.", "/dashboard/orders"],
    [demoSeller.ownerId, "VEHICLE_APPROVED", "Listing approved", "Your listing is now live on the marketplace.", "/dashboard/vehicles"],
  ];
  for (const [userId, type, title, body, link] of notes) await prisma.notification.create({ data: { userId, type, title, body, link, createdAt: ago(between(5, 600) * 60_000), readAt: rand() < 0.4 ? ago(60_000) : null } });
  await prisma.notification.create({ data: { userId: superAdmin.id, type: "SYSTEM", title: "New KYC to review", body: "Deccan Drive Hub submitted KYC documents.", link: "/admin/dealers?status=UNDER_REVIEW" } });

  // Fraud flags (for admin review)
  await prisma.fraudFlag.create({ data: { type: "RAPID_BIDDING", severity: 1, userId: dealers[9].ownerId, dealerId: dealers[9].id, details: { bidsInWindow: 12, windowSec: 60 } } });
  await prisma.fraudFlag.create({ data: { type: "SUSPENDED_REREGISTER", severity: 3, userId: dealers[20].ownerId, dealerId: dealers[20].id, details: { matchedDealerId: dealers[21].id, matchedOn: "PHONE (similar)" } } });
  await prisma.fraudFlag.create({ data: { type: "SELF_BID_ATTEMPT", severity: 2, userId: dealers[7].ownerId, dealerId: dealers[7].id, details: { note: "Seller-side account attempted to bid on own vehicle (blocked)." }, status: "REVIEWED", reviewedById: opsAdmin.id, reviewNote: "Staff mistake — dealer educated." } });

  // Daily stats (60 days) for analytics
  console.log("Analytics history…");
  const statRows: Prisma.VehicleDailyStatCreateManyInput[] = [];
  for (const v of vehicles) {
    if (["draft", "pending"].includes(v.plan.kind)) continue;
    for (let d = 0; d < 60; d++) {
      const day = new Date(now - d * D);
      day.setUTCHours(0, 0, 0, 0);
      if (day < v.createdAt) break;
      if (rand() < 0.35) continue;
      statRows.push({ vehicleId: v.id, day, views: between(1, 40), watchAdds: rand() < 0.2 ? 1 : 0, enquiries: rand() < 0.05 ? 1 : 0 });
    }
  }
  await prisma.vehicleDailyStat.createMany({ data: statRows, skipDuplicates: true });

  // Dealer aggregates
  for (const d of dealers) {
    const [sold, bought, agg] = await Promise.all([
      prisma.order.count({ where: { sellerDealerId: d.id, status: "COMPLETED" } }),
      prisma.order.count({ where: { buyerDealerId: d.id, status: "COMPLETED" } }),
      prisma.review.aggregate({ where: { subjectDealerId: d.id }, _avg: { rating: true }, _count: true }),
    ]);
    await prisma.dealer.update({ where: { id: d.id }, data: { soldCount: sold + between(20, 180), boughtCount: bought, ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10, ratingCount: agg._count } });
  }

  // CMS
  console.log("CMS content…");
  for (const p of LEGAL_PAGES) await prisma.cmsPage.create({ data: { slug: p.slug, title: p.title, category: "LEGAL", body: LEGAL_BODY[p.slug] ?? "" } });
  for (const h of HELP_ARTICLES) await prisma.cmsPage.create({ data: { slug: h.slug, title: h.title, category: "HELP", body: h.body } });
  for (const [i, f] of FAQS.entries()) await prisma.faq.create({ data: { question: f.q, answer: f.a, category: f.c, sortOrder: i } });
  for (const [i, t] of TESTIMONIALS.entries()) await prisma.testimonial.create({ data: { ...t, sortOrder: i } });
  await prisma.banner.create({ data: { placement: "HOME_PROMO", title: "Monsoon Trade-in Fest", subtitle: "Zero listing fee on all auctions this month for Kerala dealers.", ctaLabel: "Start selling", ctaHref: "/register", sortOrder: 0 } });
  await prisma.banner.create({ data: { placement: "DASHBOARD", title: "Upgrade to Premium", subtitle: "Unlimited listings, 0.5% seller fee and 8 featured slots every month.", ctaLabel: "Compare plans", ctaHref: "/dashboard/settings?tab=plan", sortOrder: 0 } });

  // A few audit entries for the admin log
  await prisma.auditLog.createMany({
    data: [
      { userId: opsAdmin.id, action: "kyc.approve", entityType: "Dealer", entityId: demoBuyer.id, after: { status: "VERIFIED" }, createdAt: ago(90 * D) },
      { userId: superAdmin.id, action: "settings.update", entityType: "Setting", entityId: "auction.antiSnipeTriggerSeconds", before: 60, after: 120, createdAt: ago(30 * D) },
      { userId: opsAdmin.id, action: "dealer.suspended", entityType: "Dealer", entityId: dealers[21].id, after: { reason: "Repeated failure to hand over vehicles" }, createdAt: ago(8 * D) },
    ],
  });

  const counts = {
    dealers: await prisma.dealer.count(),
    vehicles: await prisma.vehicle.count(),
    auctions: await prisma.auction.count(),
    liveAuctions: await prisma.auction.count({ where: { status: "LIVE" } }),
    bids: await prisma.bid.count(),
    orders: await prisma.order.count(),
    completed: await prisma.order.count({ where: { status: "COMPLETED" } }),
  };
  console.log("Seed complete in", Math.round((Date.now() - t0) / 1000), "s:", counts, "(bids created:", totalBids, ")");
  console.log("\nDemo logins (development/demo mode only):");
  console.log("  Super admin  admin@autobidx.in  / Admin@123");
  console.log("  Admin        ops@autobidx.in    / Admin@123");
  console.log("  Seller       seller@autobidx.in / Demo@1234");
  console.log("  Buyer        buyer@autobidx.in  / Demo@1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
