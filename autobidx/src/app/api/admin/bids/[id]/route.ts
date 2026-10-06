import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../_guard";
import { adminCancelBid } from "@/server/services/auctions";

export const POST = route<{ id: string }>(async ({ req, params, actor }) => {
  const a = adminGuard(actor, "bids.manage");
  const { reason } = await parseJson(req, z.object({ reason: z.string().trim().min(3, "Give a reason").max(300) }));
  await adminCancelBid(params.id, a, reason);
  return { ok: true };
});
