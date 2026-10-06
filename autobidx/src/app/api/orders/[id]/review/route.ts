import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { createReview } from "@/server/services/reviews";

export const POST = route<{ id: string }>(async ({ req, params, actor }) => {
  const input = await parseJson(req, z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().max(1000).optional() }));
  const r = await createReview(requireActor(actor), { orderId: params.id, ...input });
  return { id: r.id };
});
