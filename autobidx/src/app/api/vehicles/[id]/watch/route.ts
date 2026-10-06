import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { toggleWatch } from "@/server/services/vehicles";

export const POST = route<{ id: string }>(
  async ({ req, params, actor }) => {
    const a = requireActor(actor);
    const { on } = await parseJson(req, z.object({ on: z.boolean() }));
    return toggleWatch(a.userId, params.id, on);
  },
  { rate: [60, 60], rateKey: "watch" },
);
