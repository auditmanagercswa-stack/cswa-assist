import { notFound, permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { vehiclePath } from "@/lib/slug";

/** /vehicles/[id] → canonical SEO URL /cars/{make}/{model}/{year}/{code} */
export default async function VehicleRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await prisma.vehicle.findFirst({ where: { OR: [{ id }, { code: id }] }, select: { code: true, year: true, make: { select: { slug: true } }, model: { select: { slug: true } } } });
  if (!v) notFound();
  permanentRedirect(vehiclePath(v));
}
