import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { postDisputeMessage } from "@/server/services/disputes";

export const POST = route<{ id: string }>(async ({ req, params, actor }) => {
  const input = await parseJson(req, z.object({ body: z.string().trim().min(2, "Write a message").max(4000), internal: z.boolean().optional(), requestDocuments: z.boolean().optional() }));
  await postDisputeMessage(requireActor(actor), params.id, input.body, input);
  return { ok: true };
});
