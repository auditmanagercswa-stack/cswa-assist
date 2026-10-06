import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../_guard";
import { savePlan } from "@/server/services/fee-admin";

export const PUT = route<{ id: string }>(async ({ req, params, actor }) => {
  const a = adminGuard(actor, "fees.manage");
  const input = await parseJson(
    req,
    z.object({
      name: z.string().min(2).max(40),
      priceMonthly: z.coerce.number().int().min(0),
      listingLimit: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).nullable()),
      featuredCredits: z.coerce.number().int().min(0),
      analytics: z.boolean(),
      advancedAnalytics: z.boolean(),
      prioritySupport: z.boolean(),
      features: z.array(z.string().max(120)).max(12),
      active: z.boolean(),
    }),
  );
  await savePlan(a, params.id, input);
  return { ok: true };
});
