import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requireSeller } from "@/server/auth/rbac";
import { relistAuction } from "@/server/services/auctions";

export const POST = route<{ id: string }>(async ({ req, params, actor }) => {
  const a = requireSeller(actor);
  const input = await parseJson(
    req,
    z.object({
      durationHours: z.coerce.number().int().min(1).max(24 * 14).optional(),
      reservePrice: z.coerce.number().int().min(1000).nullable().optional(),
      startingBid: z.coerce.number().int().min(1000).optional(),
    }),
  );
  const auction = await relistAuction(params.id, a, input);
  return { auctionId: auction.id };
});
