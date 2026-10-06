import { route, parseJson } from "@/server/http";
import { adminGuard } from "../_guard";
import { saveFeeRule } from "@/server/services/fee-admin";
import { ruleSchema } from "./schema";

export const POST = route(async ({ req, actor }) => {
  const a = adminGuard(actor, "fees.manage");
  const input = await parseJson(req, ruleSchema);
  const r = await saveFeeRule(a, input);
  return { id: r.id };
});
