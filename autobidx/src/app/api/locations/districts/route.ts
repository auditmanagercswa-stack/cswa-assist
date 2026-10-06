import { route } from "@/server/http";
import { getDistricts, getDistrictsByStateSlug } from "@/server/services/catalog";

export const GET = route(async ({ req }) => {
  const u = new URL(req.url);
  const stateId = u.searchParams.get("stateId");
  const state = u.searchParams.get("state");
  if (stateId) return { items: await getDistricts(stateId) };
  if (state) return { items: await getDistrictsByStateSlug(state) };
  return { items: [] };
});
