import { route } from "@/server/http";
import { getModels, getModelsBySlug } from "@/server/services/catalog";

export const GET = route(async ({ req }) => {
  const u = new URL(req.url);
  const makeId = u.searchParams.get("makeId");
  const make = u.searchParams.get("make");
  if (makeId) return { items: await getModels(makeId) };
  if (make) return { items: await getModelsBySlug(make) };
  return { items: [] };
});
