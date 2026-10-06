import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../../_guard";
import { adminSetDealerStatus } from "@/server/services/dealers";

export const POST = route<{ id: string }>(async ({ req, params, actor, ip }) => {
  const a = adminGuard(actor, "dealers.manage");
  const { status, reason } = await parseJson(req, z.object({ status: z.enum(["SUSPENDED", "BLOCKED", "VERIFIED"]), reason: z.string().trim().min(3, "Give a reason").max(500) }));
  await adminSetDealerStatus(a, params.id, status, reason, ip);
  return { ok: true };
});
