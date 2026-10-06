import { prisma } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { route } from "@/server/http";
import { inspectionReportPdfFor } from "@/server/services/documents";

/** Inspection reports are public for published listings (they build buyer trust). */
export const GET = route<{ id: string }>(async ({ params }) => {
  const ins = await prisma.vehicleInspection.findUnique({ where: { id: params.id }, include: { vehicle: { select: { status: true, code: true } } } });
  if (!ins || ["DRAFT", "PENDING_APPROVAL", "REJECTED", "CANCELLED"].includes(ins.vehicle.status)) throw notFound();
  const pdf = await inspectionReportPdfFor(ins.id);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="inspection-${ins.vehicle.code}.pdf"`, "Cache-Control": "public, max-age=300" } });
});
