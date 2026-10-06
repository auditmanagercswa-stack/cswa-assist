import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDateTime, formatINR, formatNumber, humanize } from "@/lib/format";
import { vehiclePath } from "@/lib/slug";
import { can, requirePermission } from "@/server/auth/rbac";
import { getCurrentActor } from "@/server/auth/session";
import { getMakes, getStates } from "@/server/services/catalog";
import { INSPECTION_CHECKLIST } from "@/server/services/inspections";
import { getSetting } from "@/server/settings";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { VehicleForm } from "@/components/forms/vehicle-form";
import { InspectionForm } from "./inspection-form";

export const metadata = { title: "Vehicle" };

export default async function AdminVehicle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const actor = requirePermission(await getCurrentActor(), "vehicles.manage");
  const { id } = await params;
  const { edit } = await searchParams;
  const v = await prisma.vehicle.findUnique({
    where: { id },
    include: { make: true, model: true, dealer: true, district: true, state: true, images: { orderBy: { sortOrder: "asc" } }, documents: { include: { file: { select: { id: true, originalName: true } } } }, inspections: { orderBy: { createdAt: "desc" } }, auctions: { orderBy: { createdAt: "desc" } }, featureListings: { orderBy: { createdAt: "desc" }, take: 3 } },
  });
  if (!v) notFound();
  const audit = await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "desc" }, take: 15, include: { user: { select: { name: true } } } });
  const live = v.auctions.find((a) => a.status === "LIVE" || a.status === "SCHEDULED");
  const openInspection = v.inspections.find((i) => i.status === "REQUESTED" || i.status === "SCHEDULED");
  if (edit) {
    const [makes, states, maxImages] = await Promise.all([getMakes(), getStates(), getSetting("listing.maxImages")]);
    const files = await prisma.storedFile.findMany({ where: { key: { in: v.images.map((i) => i.url.replace(/^\/media\//, "")) } }, select: { id: true, key: true } });
    const byKey = new Map(files.map((f) => [f.key, f.id]));
    return (
      <div>
        <Link href={`/admin/vehicles/${id}`} className="mb-4 inline-flex items-center gap-1 text-[13.5px] font-semibold text-slate-600"><ChevronLeft className="h-4 w-4" />Back</Link>
        <PageHeader title={`Edit: ${v.title}`} subtitle="Admin edits are audited and don't re-trigger approval." />
        <VehicleForm initial={{ ...v, media: v.images.flatMap((i) => (byKey.get(i.url.replace(/^\/media\//, "")) ? [{ fileId: byKey.get(i.url.replace(/^\/media\//, ""))!, url: i.thumbUrl ?? i.url, kind: i.kind }] : [])), documents: v.documents.map((d) => ({ type: d.type, fileId: d.fileId, name: d.file.originalName })) } as never} makes={makes} states={states} maxImages={maxImages} verified status={v.status} />
      </div>
    );
  }
  return (
    <div>
      <Link href="/admin/vehicles" className="mb-4 inline-flex items-center gap-1 text-[13.5px] font-semibold text-slate-600 hover:text-ink-900"><ChevronLeft className="h-4 w-4" />Vehicles</Link>
      <PageHeader
        eyebrow={<span className="flex items-center gap-2">#{v.code} <StatusBadge status={v.status} /></span>}
        title={v.title}
        subtitle={<>by <Link href={`/admin/dealers/${v.dealerId}`} className="font-semibold underline">{v.dealer.name}</Link> · {v.district.name}, {v.state.name} · reg {v.registrationNumber ?? "—"} · VIN {v.vin ?? "—"}</>}
        actions={
          <>
            <Link href={vehiclePath(v)} target="_blank" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold"><ExternalLink className="h-3.5 w-3.5" />View</Link>
            <ButtonLink href={`/admin/vehicles/${id}?edit=1`} variant="outline" size="sm">Edit</ButtonLink>
            {v.status === "PENDING_APPROVAL" && <ActionButton url={`/api/admin/vehicles/${id}`} body={{ action: "approve" }} label="Approve" variant="success" success="Listing approved" />}
            {v.status === "PENDING_APPROVAL" && <ActionButton url={`/api/admin/vehicles/${id}`} body={{ action: "reject" }} label="Reject" danger reason={{ label: "What should the dealer fix?", required: true }} success="Listing rejected" />}
            {["PUBLISHED", "AUCTION_LIVE", "AUCTION_ENDED"].includes(v.status) && <ActionButton url={`/api/admin/vehicles/${id}`} body={{ action: "suspend" }} label="Suspend" danger reason={{ label: "Reason (sent to the dealer)", required: true }} success="Listing suspended" />}
            {v.status === "SUSPENDED" && <ActionButton url={`/api/admin/vehicles/${id}`} body={{ action: "reinstate" }} label="Reinstate" variant="success" reason={{ label: "Note" }} success="Listing reinstated" />}
            {!["SOLD", "RESERVED", "CANCELLED"].includes(v.status) && <ActionButton url={`/api/admin/vehicles/${id}`} body={{ action: "remove" }} label="Remove" danger reason={{ label: "Reason" }} confirm={{ title: "Remove this listing?", body: "Any live auction is cancelled." }} success="Listing removed" />}
            {["PUBLISHED", "AUCTION_LIVE"].includes(v.status) && (v.featuredUntil && v.featuredUntil > new Date() ? <ActionButton url={`/api/admin/vehicles/${id}`} body={{ action: "feature", days: 0 }} label="Unfeature" success="Unfeatured" /> : <ActionButton url={`/api/admin/vehicles/${id}`} body={{ action: "feature", days: 7 }} label="Feature 7 days" success="Featured for 7 days" />)}
          </>
        }
      />
      {v.statusReason && <div className="mb-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Status note: {v.statusReason}</div>}
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          <Card padded={false} className="overflow-hidden">
            <div className="grid grid-cols-4 gap-1">
              {v.images.slice(0, 8).map((im) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={im.id} src={im.thumbUrl ?? im.url} alt="" className="aspect-[4/3] w-full object-cover" />
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <dl className="grid grid-cols-2 gap-3 text-[13.5px] sm:grid-cols-3">
              {[["Year / reg.", `${v.year} / ${v.registrationYear}`], ["KM", formatNumber(v.kmDriven)], ["Fuel / trans.", `${humanize(v.fuel)} / ${humanize(v.transmission)}`], ["Owners", v.owners], ["Colour", v.color], ["Insurance", humanize(v.insuranceStatus)], ["RC", humanize(v.rcStatus)], ["Condition", humanize(v.overallCondition)], ["Accident / flood", `${v.accidentHistory ? "Yes" : "No"} / ${v.floodDamage ? "Yes" : "No"}`], ["Expected", formatINR(v.expectedPrice)], ["Reserve", formatINR(v.reservePrice)], ["Buy now", v.buyNowEnabled ? formatINR(v.buyNowPrice) : "Off"], ["Seller margin", formatINR(v.sellerMargin)], ["Views", formatNumber(v.viewCount)], ["Watchers", formatNumber(v.watchCount)]].map(([k, val]) => (
                <div key={k as string}><dt className="text-slate-500">{k}</dt><dd className="font-semibold text-ink-900">{val}</dd></div>
              ))}
            </dl>
            {v.documents.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                {v.documents.map((d) => <a key={d.id} href={`/api/files/${d.file.id}`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-semibold hover:border-ink-900">{humanize(d.type)}</a>)}
              </div>
            )}
          </Card>
          {can(actor, "inspections.manage") && (
            <Card>
              <CardHeader title={openInspection ? "Inspection requested" : "Record inspection"} subtitle={openInspection ? `Requested ${formatDateTime(openInspection.createdAt)}` : v.inspectionVerified ? `Current score ${v.inspectionScore}/100 — recording again replaces the badge` : "Publishes a scored report and an 'Inspected' badge"} />
              <InspectionForm vehicleId={v.id} inspectionId={openInspection?.id} checklist={[...INSPECTION_CHECKLIST]} />
            </Card>
          )}
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Auctions" />
            {v.auctions.length === 0 ? <p className="text-sm text-slate-500">No auctions.</p> : (
              <ul className="space-y-3 text-[13.5px]">
                {v.auctions.map((a) => (
                  <li key={a.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between"><Link href={`/auctions/${a.id}`} className="font-semibold hover:text-ignite-600">{formatDateTime(a.startAt)} → {formatDateTime(a.endAt)}</Link><StatusBadge status={a.result ?? a.status} /></div>
                    <div className="mt-1 text-slate-500">{a.bidCount} bids · current {formatINR(a.currentBid)} · extended ×{a.extensionCount}</div>
                    {a.id === live?.id && can(actor, "auctions.manage") && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {a.status === "SCHEDULED" && <ActionButton url={`/api/admin/auctions/${a.id}`} body={{ action: "start" }} label="Start now" variant="success" confirm={{ title: "Start this auction now?" }} success="Auction started" />}
                        {a.status === "LIVE" && <ActionButton url={`/api/admin/auctions/${a.id}`} body={{ action: "end" }} label="End now & settle" confirm={{ title: "End and settle now?", body: "The highest valid bid wins if the reserve is met." }} success="Auction closed" />}
                        <ActionButton url={`/api/admin/auctions/${a.id}`} body={{ action: "stop" }} label="Stop (cancel)" danger reason={{ label: "Reason (sent to bidders)", required: true }} success="Auction cancelled" />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Audit trail" />
            <ul className="space-y-1.5 text-[12.5px]">{audit.map((a) => <li key={a.id} className="flex justify-between gap-2"><span className="font-mono">{a.action}</span><span className="text-slate-500">{a.user?.name ?? "system"} · {formatDateTime(a.createdAt)}</span></li>)}</ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
