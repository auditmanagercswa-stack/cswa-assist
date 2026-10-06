import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { cancelAutoBid, setAutoBid } from "@/server/services/auctions";

export const POST = route<{ id: string }>(
  async ({ req, params, actor, ip }) => {
    const { maxAmount } = await parseJson(req, z.object({ maxAmount: z.coerce.number().int().positive("Enter your maximum bid") }));
    return setAutoBid({ auctionId: params.id, actor, maxAmount, ip });
  },
  { rate: [20, 60], rateKey: "autobid" },
);

export const DELETE = route<{ id: string }>(async ({ params, actor }) => {
  await cancelAutoBid(params.id, requireActor(actor));
  return { ok: true };
});
