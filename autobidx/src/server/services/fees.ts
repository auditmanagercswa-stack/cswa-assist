import { prisma, type Db } from "@/lib/db";
import type { FeeCalcType, FeePayer, FeeTrigger } from "@prisma/client";
import { getSetting } from "../settings";

/**
 * Configurable fee & commission engine.
 * All amounts are computed server-side from Fee/FeeRule rows (editable in Admin → Fees).
 * Nothing here is hard-coded: amounts, percentages, caps, slabs, GST and plan overrides are data.
 */

export type FeeRuleData = {
  id: string;
  planId: string | null;
  calcType: FeeCalcType;
  fixedAmount: number;
  rateBps: number;
  minAmount: number | null;
  maxAmount: number | null;
  priceFrom: number | null;
  priceTo: number | null;
  gstApplicable: boolean;
  gstRateBps: number | null;
  priority: number;
  active: boolean;
};

export type FeeData = {
  code: string;
  name: string;
  payer: FeePayer;
  trigger: FeeTrigger;
  enabled: boolean;
  sortOrder: number;
  rules: FeeRuleData[];
};

export type FeeLine = {
  code: string;
  name: string;
  payer: FeePayer;
  calcType: FeeCalcType;
  rateBps: number;
  base: number;
  amount: number;
  gstRateBps: number;
  gst: number;
  ruleId: string;
};

export type FeeBreakdown = {
  price: number;
  lines: FeeLine[];
  buyer: { fees: number; gst: number; total: number };
  seller: { fees: number; gst: number; net: number };
  platformRevenue: number; // fees excl. GST
  gstTotal: number;
  computedAt: string;
};

export function pickRule(fee: FeeData, price: number, planId: string | null): FeeRuleData | null {
  const candidates = fee.rules.filter(
    (r) => r.active && (r.priceFrom == null || price >= r.priceFrom) && (r.priceTo == null || price < r.priceTo),
  );
  const byPriority = (a: FeeRuleData, b: FeeRuleData) => b.priority - a.priority;
  if (planId) {
    const planRule = candidates.filter((r) => r.planId === planId).sort(byPriority)[0];
    if (planRule) return planRule;
  }
  return candidates.filter((r) => r.planId == null).sort(byPriority)[0] ?? null;
}

export function computeRuleAmount(rule: FeeRuleData, base: number): number {
  let amount = rule.calcType === "FIXED" ? rule.fixedAmount : Math.round((base * rule.rateBps) / 10000);
  if (rule.minAmount != null) amount = Math.max(amount, rule.minAmount);
  if (rule.maxAmount != null) amount = Math.min(amount, rule.maxAmount);
  return Math.max(0, Math.round(amount));
}

function lineFor(fee: FeeData, rule: FeeRuleData, base: number, defaultGstBps: number): FeeLine {
  const amount = computeRuleAmount(rule, base);
  const gstRateBps = rule.gstApplicable ? (rule.gstRateBps ?? defaultGstBps) : 0;
  return {
    code: fee.code,
    name: fee.name,
    payer: fee.payer,
    calcType: rule.calcType,
    rateBps: rule.rateBps,
    base,
    amount,
    gstRateBps,
    gst: Math.round((amount * gstRateBps) / 10000),
    ruleId: rule.id,
  };
}

/** Pure transaction calculation — unit tested. */
export function calculateTransactionFees(
  price: number,
  fees: FeeData[],
  ctx: { buyerPlanId: string | null; sellerPlanId: string | null; defaultGstBps: number },
): FeeBreakdown {
  if (!Number.isInteger(price) || price <= 0) throw new Error("Price must be a positive integer amount");
  const lines: FeeLine[] = [];
  for (const fee of [...fees].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!fee.enabled || fee.trigger !== "TRANSACTION") continue;
    const rule = pickRule(fee, price, fee.payer === "BUYER" ? ctx.buyerPlanId : ctx.sellerPlanId);
    if (!rule) continue;
    const line = lineFor(fee, rule, price, ctx.defaultGstBps);
    if (line.amount > 0) lines.push(line);
  }
  const sum = (payer: FeePayer, k: "amount" | "gst") => lines.filter((l) => l.payer === payer).reduce((s, l) => s + l[k], 0);
  const buyerFees = sum("BUYER", "amount");
  const buyerGst = sum("BUYER", "gst");
  const sellerFees = sum("SELLER", "amount");
  const sellerGst = sum("SELLER", "gst");
  return {
    price,
    lines,
    buyer: { fees: buyerFees, gst: buyerGst, total: price + buyerFees + buyerGst },
    seller: { fees: sellerFees, gst: sellerGst, net: price - sellerFees - sellerGst },
    platformRevenue: buyerFees + sellerFees,
    gstTotal: buyerGst + sellerGst,
    computedAt: new Date().toISOString(),
  };
}

/** Pure single-fee calculation for listing / auction / featured charges. */
export function calculateServiceFee(
  fees: FeeData[],
  trigger: FeeTrigger,
  ctx: { price: number; planId: string | null; defaultGstBps: number },
): { lines: FeeLine[]; amount: number; gst: number; total: number } {
  const lines: FeeLine[] = [];
  for (const fee of fees) {
    if (!fee.enabled || fee.trigger !== trigger) continue;
    const rule = pickRule(fee, ctx.price, ctx.planId);
    if (!rule) continue;
    const line = lineFor(fee, rule, ctx.price, ctx.defaultGstBps);
    if (line.amount > 0) lines.push(line);
  }
  const amount = lines.reduce((s, l) => s + l.amount, 0);
  const gst = lines.reduce((s, l) => s + l.gst, 0);
  return { lines, amount, gst, total: amount + gst };
}

// ───────────── Data loading ─────────────

const g = globalThis as unknown as { __feeCache?: { at: number; fees: FeeData[] } };

export function invalidateFeeCache() {
  g.__feeCache = undefined;
}

export async function loadFees(db: Db = prisma): Promise<FeeData[]> {
  if (db === prisma && g.__feeCache && Date.now() - g.__feeCache.at < 30_000) return g.__feeCache.fees;
  const rows = await db.fee.findMany({ include: { rules: true }, orderBy: { sortOrder: "asc" } });
  const fees: FeeData[] = rows.map((f) => ({
    code: f.code,
    name: f.name,
    payer: f.payer,
    trigger: f.trigger,
    enabled: f.enabled,
    sortOrder: f.sortOrder,
    rules: f.rules.map((r) => ({
      id: r.id,
      planId: r.planId,
      calcType: r.calcType,
      fixedAmount: r.fixedAmount,
      rateBps: r.rateBps,
      minAmount: r.minAmount,
      maxAmount: r.maxAmount,
      priceFrom: r.priceFrom,
      priceTo: r.priceTo,
      gstApplicable: r.gstApplicable,
      gstRateBps: r.gstRateBps,
      priority: r.priority,
      active: r.active,
    })),
  }));
  if (db === prisma) g.__feeCache = { at: Date.now(), fees };
  return fees;
}

export async function activePlanId(dealerId: string | null | undefined, db: Db = prisma): Promise<string | null> {
  if (!dealerId) return null;
  const sub = await db.subscription.findFirst({
    where: { dealerId, status: "ACTIVE", OR: [{ endAt: null }, { endAt: { gt: new Date() } }] },
    orderBy: { startAt: "desc" },
    select: { planId: true },
  });
  if (sub) return sub.planId;
  const free = await db.subscriptionPlan.findUnique({ where: { code: "FREE" }, select: { id: true } });
  return free?.id ?? null;
}

export async function quoteTransaction(
  price: number,
  parties: { buyerDealerId: string | null; sellerDealerId: string },
  db: Db = prisma,
): Promise<FeeBreakdown> {
  const [fees, buyerPlanId, sellerPlanId, defaultGstBps] = await Promise.all([
    loadFees(db),
    activePlanId(parties.buyerDealerId, db),
    activePlanId(parties.sellerDealerId, db),
    getSetting("gst.rateBps", db),
  ]);
  return calculateTransactionFees(price, fees, { buyerPlanId, sellerPlanId, defaultGstBps });
}

export async function quoteServiceFee(trigger: FeeTrigger, dealerId: string, price: number, db: Db = prisma) {
  const [fees, planId, defaultGstBps] = await Promise.all([loadFees(db), activePlanId(dealerId, db), getSetting("gst.rateBps", db)]);
  return calculateServiceFee(fees, trigger, { price, planId, defaultGstBps });
}
