import { z } from "zod";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { route, parseQuery } from "@/server/http";
import { quoteTransaction } from "@/server/services/fees";

/** Transparent fee preview for a given price on a vehicle — computed server-side from fee rules. */
export const GET = route(async ({ req, actor }) => {
  const { vehicleId, price } = parseQuery(req, z.object({ vehicleId: z.string().min(1), price: z.coerce.number().int().min(1000).max(500_000_000) }));
  const v = await prisma.vehicle.findFirst({ where: { OR: [{ id: vehicleId }, { code: vehicleId }] }, select: { dealerId: true } });
  if (!v) throw notFound();
  return quoteTransaction(price, { buyerDealerId: actor?.dealer?.id ?? null, sellerDealerId: v.dealerId });
});
