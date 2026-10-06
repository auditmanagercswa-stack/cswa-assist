import { z } from "zod";
import { route, parseJson } from "@/server/http";
import { adminGuard } from "../../_guard";
import { adminApproveVehicle, adminFeatureVehicle, adminSetVehicleStatus } from "@/server/services/vehicles";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.enum(["reject", "suspend", "remove", "reinstate"]), reason: z.string().max(500).default("") }),
  z.object({ action: z.literal("feature"), days: z.coerce.number().int().min(0).max(90) }),
]);

export const POST = route<{ id: string }>(async ({ req, params, actor }) => {
  const a = adminGuard(actor, "vehicles.manage");
  const body = await parseJson(req, schema);
  if (body.action === "approve") await adminApproveVehicle(a, params.id);
  else if (body.action === "feature") await adminFeatureVehicle(a, params.id, body.days);
  else {
    if ((body.action === "reject" || body.action === "suspend") && !body.reason.trim()) throw new (await import("@/lib/errors")).AppError("VALIDATION", "Give a reason for the dealer.");
    await adminSetVehicleStatus(a, params.id, body.action, body.reason);
  }
  return { ok: true };
});
