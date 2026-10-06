import { route, parseJson } from "@/server/http";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { vehicleSchema } from "@/lib/validation";
import { can } from "@/server/auth/rbac";
import { publicVehicle, updateVehicle, VIEWABLE_STATUSES } from "@/server/services/vehicles";

export const GET = route<{ id: string }>(async ({ params, actor }) => {
  const v = await prisma.vehicle.findFirst({
    where: { OR: [{ id: params.id }, { code: params.id }] },
    include: { images: { orderBy: { sortOrder: "asc" } }, documents: { include: { file: { select: { id: true, mime: true, originalName: true } } } }, make: true, model: true },
  });
  if (!v) throw notFound("Vehicle not found.");
  const owner = can(actor, "vehicles.manage") || (actor?.dealer && actor.dealer.id === v.dealerId);
  if (!owner && !VIEWABLE_STATUSES.includes(v.status)) throw notFound("Vehicle not found.");
  if (owner) return { vehicle: v, owner: true };
  const { documents, ...rest } = v;
  void documents;
  return { vehicle: { ...publicVehicle(rest), images: v.images, make: v.make, model: v.model }, owner: false };
});

export const PUT = route<{ id: string }>(async ({ req, params, actor, ip }) => {
  const input = await parseJson(req, vehicleSchema);
  const v = await updateVehicle(actor, params.id, input, ip);
  return { id: v.id, status: v.status };
});
