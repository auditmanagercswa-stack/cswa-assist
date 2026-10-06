import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { placeBid } from "@/server/services/auctions";
import { getSetting } from "@/server/settings";
import { rateLimit } from "@/server/ratelimit";
import { AppError } from "@/lib/errors";
import { formatINR } from "@/lib/format";

export const POST = route<{ id: string }>(async ({ req, params, actor, ip }) => {
  if (actor) {
    const perMin = await getSetting("bidding.perUserPerMinute");
    if (!rateLimit(`bids:${actor.userId}`, perMin, 60_000)) throw new AppError("RATE_LIMITED", "You're bidding too quickly. Please wait a moment.");
  }
  const { amount } = await parseJson(req, z.object({ amount: z.coerce.number({ invalid_type_error: "Enter a bid amount" }).int("Bids must be in whole rupees").positive() }));
  const result = await placeBid({ auctionId: params.id, actor, amount, ip });
  return {
    ...result,
    message: result.leading ? "Bid placed successfully." : `Bid placed, but another bidder's automatic bid is higher. Current bid ${formatINR(result.currentBid)}.`,
  };
});
