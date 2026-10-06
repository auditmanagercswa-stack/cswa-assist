import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../_guard";
import { savePage } from "@/server/services/cms";

export const POST = route(async ({ req, actor }) => {
  const a = adminGuard(actor, "content.manage");
  const input = await parseJson(req, z.object({ id: z.string().optional(), slug: z.string().min(2).max(60), title: z.string().min(2).max(120), category: z.enum(["LEGAL", "HELP", "INFO"]), body: z.string().max(50_000), published: z.boolean() }));
  const p = await savePage(a, input);
  return { id: p.id };
});
