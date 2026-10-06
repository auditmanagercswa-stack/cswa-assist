import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../_guard";
import { deleteBanner, saveBanner } from "@/server/services/cms";

export const POST = route(async ({ req, actor }) => {
  const a = adminGuard(actor, "content.manage");
  const input = await parseJson(
    req,
    z.object({ id: z.string().optional(), placement: z.enum(["HOME_HERO", "HOME_PROMO", "DASHBOARD"]), title: z.string().min(2).max(120), subtitle: z.string().max(300).nullable().optional(), ctaLabel: z.string().max(40).nullable().optional(), ctaHref: z.string().max(300).nullable().optional(), active: z.boolean(), sortOrder: z.coerce.number().int().default(0) }),
  );
  const b = await saveBanner(a, input);
  return { id: b.id };
});

export const DELETE = route(async ({ req, actor }) => {
  const a = adminGuard(actor, "content.manage");
  const { id } = await parseJson(req, z.object({ id: z.string() }));
  await deleteBanner(a, id);
  return { ok: true };
});
