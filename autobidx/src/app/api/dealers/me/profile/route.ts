import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { PINCODE_RE } from "@/lib/validation";
import { updateDealerProfile } from "@/server/services/dealers";

export const PATCH = route(async ({ req, actor }) => {
  const input = await parseJson(req, z.object({ description: z.string().max(1000).nullable().optional(), addressLine: z.string().trim().min(5).max(250).optional(), pincode: z.string().regex(PINCODE_RE).optional() }));
  await updateDealerProfile(actor, input);
  return { ok: true };
});
