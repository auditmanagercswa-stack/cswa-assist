import { prisma } from "@/lib/db";
import { AppError, conflict, forbidden, notFound } from "@/lib/errors";
import type { Prisma } from "@prisma/client";
import type { Actor } from "../auth/rbac";
import { can, requireSeller } from "../auth/rbac";
import { audit } from "../audit";
import { notifyDealer } from "../notifications/notify";
import { getSetting } from "../settings";

export const INSPECTION_CHECKLIST = [
  { key: "engine", label: "Engine", weight: 15 },
  { key: "gearbox", label: "Gearbox / Transmission", weight: 12 },
  { key: "exterior", label: "Exterior & Paint", weight: 10 },
  { key: "interior", label: "Interior", weight: 8 },
  { key: "tyres", label: "Tyres", weight: 8 },
  { key: "suspension", label: "Suspension & Steering", weight: 10 },
  { key: "electrical", label: "Electricals", weight: 8 },
  { key: "ac", label: "Air Conditioning", weight: 7 },
  { key: "accident", label: "Accident History", weight: 9 },
  { key: "flood", label: "Flood Damage", weight: 7 },
  { key: "odometer", label: "Odometer Verification", weight: 6 },
] as const;

export type ChecklistItem = { key: string; label: string; rating: number; notes?: string };

/** Weighted score out of 100 from 0–10 item ratings. */
export function inspectionScore(items: { key: string; rating: number }[]): number {
  let total = 0;
  let weights = 0;
  for (const def of INSPECTION_CHECKLIST) {
    const it = items.find((i) => i.key === def.key);
    if (!it) continue;
    const r = Math.max(0, Math.min(10, it.rating));
    total += (r / 10) * def.weight;
    weights += def.weight;
  }
  return weights ? Math.round((total / weights) * 100) : 0;
}

export function scoreGrade(score: number) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Very Good";
  if (score >= 60) return "Good";
  if (score >= 45) return "Fair";
  return "Needs Work";
}

export async function requestInspection(actorIn: Actor | null, vehicleId: string, preferredAt?: Date | null) {
  if (!(await getSetting("features.inspections"))) throw forbidden("Inspections are not available right now.");
  const actor = requireSeller(actorIn);
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!v || v.dealerId !== actor.dealer.id) throw notFound();
  const open = await prisma.vehicleInspection.findFirst({ where: { vehicleId, status: { in: ["REQUESTED", "SCHEDULED"] } } });
  if (open) throw conflict("An inspection is already requested for this vehicle.");
  const ins = await prisma.vehicleInspection.create({ data: { vehicleId, status: "REQUESTED", scheduledAt: preferredAt ?? null, requestedById: actor.userId } });
  await audit({ userId: actor.userId, action: "inspection.request", entityType: "Vehicle", entityId: vehicleId });
  return ins;
}

export async function recordInspection(actor: Actor, input: { vehicleId: string; inspectionId?: string; inspectorName: string; items: ChecklistItem[]; summary: string; odometerVerified: boolean }) {
  if (!can(actor, "inspections.manage")) throw forbidden();
  const v = await prisma.vehicle.findUnique({ where: { id: input.vehicleId } });
  if (!v) throw notFound();
  if (input.items.length < INSPECTION_CHECKLIST.length) throw new AppError("VALIDATION", "Rate every checklist item.");
  const score = inspectionScore(input.items);
  const data = {
    status: "COMPLETED" as const,
    inspectorName: input.inspectorName,
    inspectedAt: new Date(),
    score,
    checklist: input.items as unknown as Prisma.InputJsonValue,
    summary: input.summary,
    odometerVerified: input.odometerVerified,
  };
  const ins = await prisma.$transaction(async (tx) => {
    const r = input.inspectionId
      ? await tx.vehicleInspection.update({ where: { id: input.inspectionId }, data })
      : await tx.vehicleInspection.create({ data: { ...data, vehicleId: v.id } });
    await tx.vehicle.update({ where: { id: v.id }, data: { inspectionScore: score, inspectionVerified: true } });
    await audit({ userId: actor.userId, action: "inspection.complete", entityType: "Vehicle", entityId: v.id, after: { score } }, tx);
    await notifyDealer(v.dealerId, { type: "SYSTEM", title: "Inspection report ready", body: `${v.title} scored ${score}/100.`, link: `/dashboard/vehicles` }, tx);
    return r;
  });
  return ins;
}
