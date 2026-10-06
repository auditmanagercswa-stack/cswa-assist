import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { vehiclePath } from "@/lib/slug";
import { getCurrentActor } from "@/server/auth/session";
import { getMakes, getStates } from "@/server/services/catalog";
import { getSetting } from "@/server/settings";
import { PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { VehicleForm } from "@/components/forms/vehicle-form";

export const metadata = { title: "Edit vehicle" };

export default async function EditVehicle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = (await getCurrentActor())!;
  const v = await prisma.vehicle.findUnique({
    where: { id },
    include: { make: true, model: true, images: { orderBy: { sortOrder: "asc" } }, documents: { include: { file: { select: { id: true, originalName: true } } } } },
  });
  if (!v || v.dealerId !== actor.dealer?.id) notFound();
  const [makes, states, maxImages] = await Promise.all([getMakes(), getStates(), getSetting("listing.maxImages")]);
  const files = await prisma.storedFile.findMany({ where: { key: { in: v.images.map((i) => i.url.replace(/^\/media\//, "")) } }, select: { id: true, key: true } });
  const fileByKey = new Map(files.map((f) => [f.key, f.id]));
  const editable = ["DRAFT", "REJECTED", "PENDING_APPROVAL", "PUBLISHED", "AUCTION_ENDED"].includes(v.status);
  const initial = {
    ...v,
    media: v.images.flatMap((i) => {
      const fileId = fileByKey.get(i.url.replace(/^\/media\//, ""));
      return fileId ? [{ fileId, url: i.thumbUrl ?? i.url, kind: i.kind }] : [];
    }),
    documents: v.documents.map((d) => ({ type: d.type, fileId: d.fileId, name: d.file.originalName })),
  };
  return (
    <div>
      <PageHeader
        eyebrow={<span className="flex items-center gap-2">Listing #{v.code} <StatusBadge status={v.status} /></span>}
        title={v.title}
        subtitle={v.statusReason ? `Note from review team: ${v.statusReason}` : editable ? undefined : "This listing can't be edited while an auction is live or a sale is in progress."}
        actions={<Link href={vehiclePath(v)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:border-ink-900"><ExternalLink className="h-4 w-4" />View listing</Link>}
      />
      <VehicleForm initial={initial as never} makes={makes} states={states} maxImages={maxImages} verified={actor.dealer?.status === "VERIFIED"} editable={editable} status={v.status} />
    </div>
  );
}
