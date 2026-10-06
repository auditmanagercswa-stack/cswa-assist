import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { respondToOffer } from "@/server/services/sales";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("reject"), message: z.string().max(500).optional() }),
  z.object({ action: z.literal("withdraw") }),
  z.object({ action: z.literal("counter"), amount: z.coerce.number().int().positive("Enter an amount"), message: z.string().max(500).optional() }),
]);

export const POST = route<{ id: string }>(
  async ({ req, params, actor, ip }) => {
    const body = await parseJson(req, schema);
    const { offer, order } = await respondToOffer({ offerId: params.id, actor, ip, ...body });
    return { offer: { id: offer.id, status: offer.status, currentAmount: offer.currentAmount }, orderId: order?.id ?? null };
  },
  { rate: [30, 60], rateKey: "offer-respond" },
);
