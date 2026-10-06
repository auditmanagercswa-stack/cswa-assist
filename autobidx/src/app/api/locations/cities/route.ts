import { route } from "@/server/http";
import { getCities } from "@/server/services/catalog";

export const GET = route(async ({ req }) => {
  const districtId = new URL(req.url).searchParams.get("districtId");
  return { items: districtId ? await getCities(districtId) : [] };
});
