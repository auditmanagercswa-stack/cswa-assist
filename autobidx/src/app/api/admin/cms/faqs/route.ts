import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../_guard";
import { deleteFaq, saveFaq } from "@/server/services/cms";

export const POST = route(async ({ req, actor }) => {
  const a = adminGuard(actor, "content.manage");
  const input = await parseJson(req, z.object({ id: z.string().optional(), question: z.string().min(5).max(300), answer: z.string().min(5).max(3000), category: z.string().max(40).default("GENERAL"), sortOrder: z.coerce.number().int().default(0), published: z.boolean() }));
  const f = await saveFaq(a, input);
  return { id: f.id };
});

export const DELETE = route(async ({ req, actor }) => {
  const a = adminGuard(actor, "content.manage");
  const { id } = await parseJson(req, z.object({ id: z.string() }));
  await deleteFaq(a, id);
  return { ok: true };
});
