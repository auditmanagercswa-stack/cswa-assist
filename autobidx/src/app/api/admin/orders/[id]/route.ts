import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../_guard";
import { releasePayout, transitionOrder } from "@/server/services/orders";

export const POST = route<{ id: string }>(async ({ req, params, actor, ip }) => {
  const a = adminGuard(actor, "orders.manage");
  const body = await parseJson(
    req,
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("release_payout") }),
      z.object({ action: z.literal("transition"), to: z.enum(["SELLER_CONFIRMED", "DOCUMENTS_PENDING", "VEHICLE_READY", "IN_DELIVERY", "COMPLETED", "CANCELLED"]), note: z.string().max(500).optional(), deliveryMode: z.enum(["PICKUP", "DELIVERY"]).optional() }),
    ]),
  );
  if (body.action === "release_payout") await releasePayout(params.id, a, ip);
  else await transitionOrder(params.id, a, body.to, { note: body.note, deliveryMode: body.deliveryMode, ip });
  return { ok: true };
});
