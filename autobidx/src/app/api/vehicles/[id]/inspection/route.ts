import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requestInspection } from "@/server/services/inspections";

export const POST = route<{ id: string }>(async ({ req, params, actor }) => {
  const { preferredAt } = await parseJson(req, z.object({ preferredAt: z.coerce.date().optional().nullable() }));
  const ins = await requestInspection(actor, params.id, preferredAt);
  return { id: ins.id, status: ins.status };
});
