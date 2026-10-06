import { z } from "zod";

const optInt = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).nullable());

export const ruleSchema = z.object({
  feeCode: z.string().min(2),
  planId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable()),
  calcType: z.enum(["FIXED", "PERCENT"]),
  fixedAmount: z.coerce.number().int().min(0).max(10_000_000).default(0),
  rateBps: z.coerce.number().int().min(0).max(2000).default(0),
  minAmount: optInt,
  maxAmount: optInt,
  priceFrom: optInt,
  priceTo: optInt,
  gstApplicable: z.boolean(),
  gstRateBps: optInt,
  active: z.boolean(),
  priority: z.coerce.number().int().min(0).max(100).default(0),
});
