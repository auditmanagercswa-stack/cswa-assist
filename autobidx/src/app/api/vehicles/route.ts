import { route, parseJson, parseQuery } from "@/server/http";
import { vehicleSchema, vehicleSearchSchema } from "@/lib/validation";
import { createVehicle, searchVehicles } from "@/server/services/vehicles";

export const GET = route(async ({ req }) => {
  const params = parseQuery(req, vehicleSearchSchema);
  return searchVehicles(params);
});

export const POST = route(async ({ req, actor, ip }) => {
  const input = await parseJson(req, vehicleSchema);
  const v = await createVehicle(actor, input, ip);
  return Response.json({ id: v.id, code: v.code, status: v.status }, { status: 201 });
});
