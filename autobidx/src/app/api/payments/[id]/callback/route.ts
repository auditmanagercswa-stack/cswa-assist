import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { handleCallback } from "@/server/services/payments";

/** Browser callback after client-side checkout (e.g. Razorpay). Verified by signature server-side. */
export const POST = route<{ id: string }>(async ({ req, params, actor }) => {
  const payload = await parseJson(req, z.record(z.string(), z.string().max(200)));
  return handleCallback(params.id, requireActor(actor), payload);
});
