import { route } from "@/server/http";
import { notFound } from "@/lib/errors";
import { auctionSnapshot } from "@/server/services/auctions";

export const GET = route<{ id: string }>(async ({ params, actor }) => {
  const snap = await auctionSnapshot(params.id, actor?.userId);
  if (!snap) throw notFound("Auction not found.");
  return snap;
});
