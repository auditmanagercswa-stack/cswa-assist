import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../_guard";
import { adminSetUserStatus } from "@/server/services/accounts";

export const POST = route<{ id: string }>(async ({ req, params, actor }) => {
  const a = adminGuard(actor, "users.manage");
  const { status, reason } = await parseJson(req, z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "BLOCKED"]), reason: z.string().trim().min(3).max(300) }));
  await adminSetUserStatus(a.userId, params.id, status, reason);
  return { ok: true };
});
