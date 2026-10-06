import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../_guard";
import { updateFee } from "@/server/services/fee-admin";

export const PATCH = route<{ code: string }>(async ({ req, params, actor }) => {
  const a = adminGuard(actor, "fees.manage");
  const input = await parseJson(req, z.object({ enabled: z.boolean().optional(), name: z.string().min(2).max(80).optional(), description: z.string().max(300).nullable().optional() }));
  await updateFee(a, params.code, input);
  return { ok: true };
});
