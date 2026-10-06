import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../_guard";
import { reviewFlag } from "@/server/services/fraud";

export const POST = route<{ id: string }>(async ({ req, params, actor }) => {
  const a = adminGuard(actor, "fraud.manage");
  const { status, note } = await parseJson(req, z.object({ status: z.enum(["REVIEWED", "DISMISSED", "ACTIONED"]), note: z.string().trim().min(3, "Add a review note").max(500) }));
  await reviewFlag(params.id, a, status, note);
  return { ok: true };
});
