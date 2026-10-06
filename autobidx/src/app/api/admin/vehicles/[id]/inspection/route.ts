import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../../_guard";
import { recordInspection } from "@/server/services/inspections";

export const POST = route<{ id: string }>(async ({ req, params, actor }) => {
  const a = adminGuard(actor, "inspections.manage");
  const input = await parseJson(
    req,
    z.object({
      inspectionId: z.string().optional(),
      inspectorName: z.string().trim().min(2).max(80),
      summary: z.string().trim().max(2000).default(""),
      odometerVerified: z.boolean(),
      items: z.array(z.object({ key: z.string(), label: z.string(), rating: z.coerce.number().int().min(0).max(10), notes: z.string().max(200).optional() })).min(1).max(20),
    }),
  );
  const ins = await recordInspection(a, { vehicleId: params.id, ...input });
  return { id: ins.id, score: ins.score };
});
