import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../_guard";
import { adminCancelAuction, adminEndAuctionNow, adminStartAuction } from "@/server/services/auctions";

export const POST = route<{ id: string }>(async ({ req, params, actor }) => {
  const a = adminGuard(actor, "auctions.manage");
  const body = await parseJson(req, z.object({ action: z.enum(["start", "stop", "end"]), reason: z.string().max(500).default("") }));
  if (body.action === "start") await adminStartAuction(params.id, a);
  else if (body.action === "end") await adminEndAuctionNow(params.id, a);
  else await adminCancelAuction(params.id, a, body.reason || "Stopped by admin");
  return { ok: true };
});
