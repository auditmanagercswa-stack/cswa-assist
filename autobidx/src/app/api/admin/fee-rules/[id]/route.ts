import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../_guard";
import { deleteFeeRule, saveFeeRule } from "@/server/services/fee-admin";
import { ruleSchema } from "../schema";

export const PUT = route<{ id: string }>(async ({ req, params, actor }) => {
  const a = adminGuard(actor, "fees.manage");
  const input = await parseJson(req, ruleSchema);
  await saveFeeRule(a, { ...input, id: params.id });
  return { ok: true };
});

export const DELETE = route<{ id: string }>(async ({ params, actor }) => {
  const a = adminGuard(actor, "fees.manage");
  await deleteFeeRule(a, params.id);
  return { ok: true };
});
