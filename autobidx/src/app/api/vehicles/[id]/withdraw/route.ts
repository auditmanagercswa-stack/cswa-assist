import { route } from "@/server/http";
import { withdrawVehicle } from "@/server/services/vehicles";

export const POST = route<{ id: string }>(async ({ params, actor }) => {
  await withdrawVehicle(actor, params.id);
  return { ok: true };
});
