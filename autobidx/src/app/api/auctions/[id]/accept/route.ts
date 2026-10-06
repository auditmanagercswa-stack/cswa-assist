import { route } from "@/server/http";
import { requireVerifiedSeller } from "@/server/auth/rbac";
import { acceptHighestBid } from "@/server/services/auctions";

export const POST = route<{ id: string }>(async ({ params, actor, ip }) => {
  const order = await acceptHighestBid(params.id, requireVerifiedSeller(actor), ip);
  return { orderId: order.id };
});
