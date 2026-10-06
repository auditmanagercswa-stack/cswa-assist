import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { transitionOrder } from "@/server/services/orders";

const schema = z.object({
  to: z.enum(["SELLER_CONFIRMED", "DOCUMENTS_PENDING", "VEHICLE_READY", "IN_DELIVERY", "COMPLETED", "CANCELLED"]),
  note: z.string().max(500).optional(),
  deliveryMode: z.enum(["PICKUP", "DELIVERY"]).optional(),
  deliveryDate: z.coerce.date().optional(),
  deliveryNotes: z.string().max(500).optional(),
});

export const POST = route<{ id: string }>(async ({ req, params, actor, ip }) => {
  const input = await parseJson(req, schema);
  const o = await transitionOrder(params.id, requireActor(actor), input.to, { ...input, ip });
  return { status: o.status };
});
