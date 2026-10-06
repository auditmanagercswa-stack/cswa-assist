import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { updateTeamMember } from "@/server/services/dealers";

export const PATCH = route<{ memberId: string }>(async ({ req, params, actor }) => {
  const input = await parseJson(req, z.object({ role: z.enum(["OWNER", "MANAGER", "STAFF"]).optional(), canBid: z.boolean().optional(), canList: z.boolean().optional(), active: z.boolean().optional() }));
  await updateTeamMember(actor, params.memberId, input);
  return { ok: true };
});
