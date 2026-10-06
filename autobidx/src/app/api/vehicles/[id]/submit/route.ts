import { route } from "@/server/http";
import { submitVehicle } from "@/server/services/vehicles";

export const POST = route<{ id: string }>(async ({ params, actor, ip }) => {
  const v = await submitVehicle(actor, params.id, ip);
  return { id: v.id, status: v.status };
});
