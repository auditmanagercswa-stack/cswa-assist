import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../../_guard";
import { adminReviewKyc } from "@/server/services/dealers";

export const POST = route<{ id: string }>(async ({ req, params, actor, ip }) => {
  const a = adminGuard(actor, "dealers.manage");
  const { decision, notes } = await parseJson(req, z.object({ decision: z.enum(["APPROVE", "REJECT", "UNDER_REVIEW"]), notes: z.string().max(1000).default("") }));
  await adminReviewKyc(a, params.id, decision, notes, ip);
  return { ok: true };
});
