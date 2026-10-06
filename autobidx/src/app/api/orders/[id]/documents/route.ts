import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { uploadOrderDocument } from "@/server/services/documents";

export const POST = route<{ id: string }>(async ({ req, params, actor }) => {
  const input = await parseJson(req, z.object({ type: z.enum(["RC", "INSURANCE", "SALE_AGREEMENT", "DELIVERY_CHALLAN", "OTHER"]), fileId: z.string().min(1), title: z.string().max(120).optional() }));
  const doc = await uploadOrderDocument(requireActor(actor), params.id, input);
  return { id: doc.id };
});
