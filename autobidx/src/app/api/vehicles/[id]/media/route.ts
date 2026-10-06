import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { setVehicleMedia } from "@/server/services/vehicles";

const schema = z.object({
  images: z.array(z.object({ fileId: z.string().min(1), kind: z.enum(["PHOTO", "SPIN360", "VIDEO"]), alt: z.string().max(200).optional() })).max(60),
  documents: z.array(z.object({ fileId: z.string().min(1), type: z.enum(["RC", "INSURANCE", "SERVICE_RECORD", "INSPECTION_REPORT", "OTHER"]) })).max(20),
});

export const PUT = route<{ id: string }>(async ({ req, params, actor }) => {
  const input = await parseJson(req, schema);
  await setVehicleMedia(actor, params.id, input);
  return { ok: true };
});
