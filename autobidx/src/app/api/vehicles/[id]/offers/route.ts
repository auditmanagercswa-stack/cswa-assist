import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { makeOffer } from "@/server/services/sales";

export const POST = route<{ id: string }>(
  async ({ req, params, actor, ip }) => {
    const { amount, message } = await parseJson(req, z.object({ amount: z.coerce.number().int().positive("Enter an amount"), message: z.string().max(500).optional() }));
    const offer = await makeOffer({ vehicleId: params.id, actor, amount, message, ip });
    return Response.json({ id: offer.id, status: offer.status }, { status: 201 });
  },
  { rate: [10, 60], rateKey: "offer" },
);
