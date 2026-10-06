import { beforeAll, describe, expect, it } from "vitest";
import { calculateServiceFee, calculateTransactionFees, quoteTransaction, type FeeData } from "@/server/services/fees";
import { makeDealer, seedWorld, type World } from "./helpers";

const fee = (over: Omit<Partial<FeeData>, "rules"> & { rules: Partial<FeeData["rules"][number]>[] }): FeeData => ({
  code: over.code ?? "X",
  name: over.name ?? "X",
  payer: over.payer ?? "BUYER",
  trigger: over.trigger ?? "TRANSACTION",
  enabled: over.enabled ?? true,
  sortOrder: over.sortOrder ?? 0,
  rules: over.rules.map((r, i) => {
    const defaults: FeeData["rules"][number] = { id: `r${i}`, planId: null, calcType: "PERCENT", fixedAmount: 0, rateBps: 0, minAmount: null, maxAmount: null, priceFrom: null, priceTo: null, gstApplicable: true, gstRateBps: null, priority: 0, active: true };
    return Object.assign(defaults, r);
  }),
});

const STANDARD: FeeData[] = [
  fee({ code: "BUYER_PLATFORM_FEE", name: "Buyer platform fee", payer: "BUYER", sortOrder: 1, rules: [{ calcType: "PERCENT", rateBps: 50 }] }),
  fee({ code: "PROCESSING_FEE", name: "Processing fee", payer: "BUYER", sortOrder: 2, rules: [{ calcType: "FIXED", fixedAmount: 1000 }] }),
  fee({ code: "SELLER_TRANSACTION_FEE", name: "Seller fee", payer: "SELLER", sortOrder: 3, rules: [{ calcType: "PERCENT", rateBps: 100, gstApplicable: false }] }),
];

describe("fee engine (pure)", () => {
  it("matches the specification example for ₹6,00,000", () => {
    const b = calculateTransactionFees(600000, STANDARD, { buyerPlanId: null, sellerPlanId: null, defaultGstBps: 1800 });
    expect(b.lines.find((l) => l.code === "BUYER_PLATFORM_FEE")!.amount).toBe(3000);
    expect(b.lines.find((l) => l.code === "PROCESSING_FEE")!.amount).toBe(1000);
    expect(b.buyer.gst).toBe(720);
    expect(b.buyer.total).toBe(604720);
    expect(b.seller.fees).toBe(6000);
    expect(b.seller.net).toBe(594000);
    expect(b.platformRevenue).toBe(10000);
  });

  it("matches the ₹8,00,000 transaction-economics example", () => {
    const b = calculateTransactionFees(800000, STANDARD, { buyerPlanId: null, sellerPlanId: null, defaultGstBps: 1800 });
    expect(b.lines[0].amount).toBe(4000);
    expect(b.buyer.gst).toBe(900); // 18% of (4000 + 1000)
    expect(b.buyer.total).toBe(805900);
    expect(b.seller.net).toBe(792000);
  });

  it("applies minimum and maximum caps", () => {
    const fees = [fee({ rules: [{ calcType: "PERCENT", rateBps: 50, minAmount: 2000, maxAmount: 25000, gstApplicable: false }] })];
    expect(calculateTransactionFees(100000, fees, { buyerPlanId: null, sellerPlanId: null, defaultGstBps: 1800 }).buyer.fees).toBe(2000);
    expect(calculateTransactionFees(10_000_000, fees, { buyerPlanId: null, sellerPlanId: null, defaultGstBps: 1800 }).buyer.fees).toBe(25000);
  });

  it("prefers plan-specific rules for the paying party's plan", () => {
    const fees = [fee({ payer: "SELLER", rules: [{ rateBps: 100, gstApplicable: false }, { rateBps: 50, gstApplicable: false, planId: "premium" }] })];
    expect(calculateTransactionFees(1_000_000, fees, { buyerPlanId: "premium", sellerPlanId: null, defaultGstBps: 1800 }).seller.fees).toBe(10000);
    expect(calculateTransactionFees(1_000_000, fees, { buyerPlanId: null, sellerPlanId: "premium", defaultGstBps: 1800 }).seller.fees).toBe(5000);
  });

  it("supports price slabs, rule priority, GST override and disabled fees", () => {
    const fees = [
      fee({ code: "SLAB", rules: [{ calcType: "FIXED", fixedAmount: 500, priceTo: 500000, gstRateBps: 500 }, { calcType: "FIXED", fixedAmount: 1500, priceFrom: 500000 }, { calcType: "FIXED", fixedAmount: 9999, priceFrom: 500000, active: false }] }),
      fee({ code: "OFF", enabled: false, rules: [{ calcType: "FIXED", fixedAmount: 777 }] }),
    ];
    const low = calculateTransactionFees(300000, fees, { buyerPlanId: null, sellerPlanId: null, defaultGstBps: 1800 });
    expect(low.buyer.fees).toBe(500);
    expect(low.buyer.gst).toBe(25); // 5% override
    const high = calculateTransactionFees(700000, fees, { buyerPlanId: null, sellerPlanId: null, defaultGstBps: 1800 });
    expect(high.buyer.fees).toBe(1500);
    expect(high.lines.some((l) => l.code === "OFF")).toBe(false);
  });

  it("rejects invalid prices", () => {
    expect(() => calculateTransactionFees(0, STANDARD, { buyerPlanId: null, sellerPlanId: null, defaultGstBps: 1800 })).toThrow();
    expect(() => calculateTransactionFees(100.5, STANDARD, { buyerPlanId: null, sellerPlanId: null, defaultGstBps: 1800 })).toThrow();
  });

  it("computes service fees (listing) independently of transaction fees", () => {
    const fees = [...STANDARD, fee({ code: "LISTING_FEE", payer: "SELLER", trigger: "LISTING", rules: [{ calcType: "FIXED", fixedAmount: 499 }] })];
    const q = calculateServiceFee(fees, "LISTING", { price: 500000, planId: null, defaultGstBps: 1800 });
    expect(q.amount).toBe(499);
    expect(q.gst).toBe(90);
    expect(q.total).toBe(589);
  });
});

describe("fee engine (database-backed)", () => {
  let w: World;
  beforeAll(async () => {
    w = await seedWorld();
  });
  it("quotes from DB rules with the seller's subscription plan", async () => {
    const seller = await makeDealer(w, { plan: "PRO" });
    const buyer = await makeDealer(w);
    const q = await quoteTransaction(600000, { buyerDealerId: buyer.dealer.id, sellerDealerId: seller.dealer.id });
    expect(q.buyer.total).toBe(604720);
    expect(q.seller.fees).toBe(4500); // PRO plan: 0.75%
    expect(q.seller.net).toBe(595500);
  });
});
