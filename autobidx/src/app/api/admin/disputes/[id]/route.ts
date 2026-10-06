import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../_guard";
import { adminUpdateDispute } from "@/server/services/disputes";

export const POST = route<{ id: string }>(async ({ req, params, actor }) => {
  const a = adminGuard(actor, "disputes.manage");
  const input = await parseJson(
    req,
    z.object({
      status: z.enum(["OPEN", "INVESTIGATING", "AWAITING_DOCUMENTS", "RESOLVED", "REFUNDED", "CLOSED"]),
      resolution: z.string().max(2000).optional(),
      refundAmount: z.coerce.number().int().min(0).optional(),
      penaltyAmount: z.coerce.number().int().min(0).optional(),
      penaltyParty: z.enum(["BUYER", "SELLER"]).optional(),
      restoreOrder: z.boolean().optional(),
      cancelOrder: z.boolean().optional(),
    }),
  );
  await adminUpdateDispute(a, params.id, input);
  return { ok: true };
});
