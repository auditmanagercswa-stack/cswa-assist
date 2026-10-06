import { prisma } from "@/lib/db";
import { AppError, forbidden, notFound } from "@/lib/errors";
import type { FeeCalcType, Prisma } from "@prisma/client";
import type { Actor } from "../auth/rbac";
import { can } from "../auth/rbac";
import { audit } from "../audit";
import { invalidateFeeCache } from "./fees";

function guard(actor: Actor) {
  if (!can(actor, "fees.manage")) throw forbidden();
}

export const listFeesAdmin = () =>
  prisma.fee.findMany({ orderBy: { sortOrder: "asc" }, include: { rules: { include: { plan: { select: { code: true, name: true } } }, orderBy: [{ planId: "asc" }, { priority: "desc" }] } } });

export async function updateFee(actor: Actor, code: string, input: { enabled?: boolean; name?: string; description?: string | null }) {
  guard(actor);
  const fee = await prisma.fee.findUnique({ where: { code } });
  if (!fee) throw notFound();
  const updated = await prisma.fee.update({ where: { code }, data: input });
  invalidateFeeCache();
  await audit({ userId: actor.userId, action: "fees.update", entityType: "Fee", entityId: fee.id, before: { enabled: fee.enabled, name: fee.name }, after: input });
  return updated;
}

export type RuleInput = {
  id?: string;
  feeCode: string;
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
  active: boolean;
  priority: number;
};

export async function saveFeeRule(actor: Actor, input: RuleInput) {
  guard(actor);
  const fee = await prisma.fee.findUnique({ where: { code: input.feeCode } });
  if (!fee) throw notFound("Fee not found.");
  if (input.calcType === "PERCENT" && (input.rateBps < 0 || input.rateBps > 2000)) throw new AppError("VALIDATION", "Percentage must be between 0% and 20%.");
  if (input.minAmount != null && input.maxAmount != null && input.minAmount > input.maxAmount) throw new AppError("VALIDATION", "Minimum fee can't exceed maximum fee.");
  if (input.priceFrom != null && input.priceTo != null && input.priceFrom >= input.priceTo) throw new AppError("VALIDATION", "Price slab 'from' must be below 'to'.");
  const data: Prisma.FeeRuleUncheckedCreateInput = {
    feeId: fee.id,
    planId: input.planId,
    calcType: input.calcType,
    fixedAmount: input.fixedAmount,
    rateBps: input.rateBps,
    minAmount: input.minAmount,
    maxAmount: input.maxAmount,
    priceFrom: input.priceFrom,
    priceTo: input.priceTo,
    gstApplicable: input.gstApplicable,
    gstRateBps: input.gstRateBps,
    active: input.active,
    priority: input.priority,
  };
  const before = input.id ? await prisma.feeRule.findUnique({ where: { id: input.id } }) : null;
  const rule = input.id ? await prisma.feeRule.update({ where: { id: input.id }, data }) : await prisma.feeRule.create({ data });
  invalidateFeeCache();
  await audit({ userId: actor.userId, action: input.id ? "fees.rule_update" : "fees.rule_create", entityType: "FeeRule", entityId: rule.id, before: before ?? undefined, after: rule });
  return rule;
}

export async function deleteFeeRule(actor: Actor, id: string) {
  guard(actor);
  const before = await prisma.feeRule.findUnique({ where: { id } });
  if (!before) throw notFound();
  await prisma.feeRule.delete({ where: { id } });
  invalidateFeeCache();
  await audit({ userId: actor.userId, action: "fees.rule_delete", entityType: "FeeRule", entityId: id, before });
}

export async function savePlan(actor: Actor, id: string, input: { name: string; priceMonthly: number; listingLimit: number | null; featuredCredits: number; analytics: boolean; advancedAnalytics: boolean; prioritySupport: boolean; features: string[]; active: boolean }) {
  guard(actor);
  const before = await prisma.subscriptionPlan.findUnique({ where: { id } });
  if (!before) throw notFound();
  const plan = await prisma.subscriptionPlan.update({ where: { id }, data: { ...input, features: input.features } });
  await audit({ userId: actor.userId, action: "plans.update", entityType: "SubscriptionPlan", entityId: id, before, after: plan });
  return plan;
}
