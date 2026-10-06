import { route } from "@/server/http";
import { getVariants } from "@/server/services/catalog";

export const GET = route(async ({ req }) => {
  const modelId = new URL(req.url).searchParams.get("modelId");
  return { items: modelId ? await getVariants(modelId) : [] };
});
