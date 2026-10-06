import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Fuel, Gauge, MapPin, Settings2, ShieldCheck, Star } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatINR, formatNumber, humanize } from "@/lib/format";
import { vehiclePath } from "@/lib/slug";
import { getCurrentActor } from "@/server/auth/session";
import { buyBlockReason } from "@/server/auth/rbac";
import { getSetting } from "@/server/settings";
import { auctionSnapshot } from "@/server/services/auctions";
import { BidPanel } from "@/components/auction/bid-panel";
import { ImageGallery } from "@/components/vehicles/image-gallery";
import { PurchaseActions } from "@/components/vehicles/purchase-actions";
import { VerificationBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

async function load(id: string) {
  return prisma.auction.findUnique({
    where: { id },
    include: { vehicle: { include: { make: true, model: true, images: { orderBy: { sortOrder: "asc" } }, dealer: { include: { district: true } }, district: true } } },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const a = await load((await params).id);
  if (!a) return { title: "Auction not found" };
  return { title: `Auction: ${a.vehicle.title}`, description: `Bid live on ${a.vehicle.title}. Current bid ${formatINR(a.currentBid ?? a.startingBid)}.`, alternates: { canonical: vehiclePath(a.vehicle) } };
}

export default async function AuctionRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await load(id);
  if (!a) notFound();
  const v = a.vehicle;
  const actor = await getCurrentActor();
  const isOwner = actor?.dealer?.id === v.dealerId;
  if (["DRAFT", "PENDING_APPROVAL", "REJECTED"].includes(v.status) && !isOwner && !actor?.permissions.has("auctions.manage")) notFound();
  const [snap, individualOn, buyNowOn] = await Promise.all([auctionSnapshot(id, actor?.userId), getSetting("features.individualBuyers"), getSetting("features.buyNow")]);
  if (!snap) notFound();
  const block = buyBlockReason(actor, v.dealerId, individualOn);
  const canBuyNow = buyNowOn && v.buyNowEnabled && !!v.buyNowPrice && v.status === "AUCTION_LIVE" && (a.currentBid ?? 0) < v.buyNowPrice;
  const path = `/auctions/${id}`;
  return (
    <div className="mx-auto max-w-7xl px-4 py-5 pb-28 sm:px-6 lg:pb-10">
      <Link href={vehiclePath(v)} className="mb-4 inline-flex items-center gap-1 text-[13.5px] font-semibold text-slate-600 hover:text-ink-900"><ChevronLeft className="h-4 w-4" />Full vehicle details</Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <div>
            <h1 className="text-[24px] font-bold leading-tight text-ink-900 sm:text-[30px]">{v.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-slate-600">
              <span className="flex items-center gap-1"><Gauge className="h-4 w-4 text-slate-400" />{formatNumber(v.kmDriven)} km</span>
              <span className="flex items-center gap-1"><Fuel className="h-4 w-4 text-slate-400" />{humanize(v.fuel)}</span>
              <span className="flex items-center gap-1"><Settings2 className="h-4 w-4 text-slate-400" />{humanize(v.transmission)}</span>
              <span className="flex items-center gap-1"><MapPin className="h-4 w-4 text-slate-400" />{v.cityName ?? v.district.name}</span>
              {v.inspectionVerified && <span className="flex items-center gap-1 font-semibold text-verified-600"><ShieldCheck className="h-4 w-4" />Inspected {v.inspectionScore}/100</span>}
            </div>
          </div>
          <ImageGallery images={v.images.map((i) => ({ url: i.url, thumbUrl: i.thumbUrl, alt: i.alt, kind: i.kind }))} title={v.title} />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          <BidPanel initial={snap} vehicleId={v.id} signedIn={!!actor} blockReason={block} variant="full" loginNext={path} />
          {canBuyNow && !isOwner && (
            <Card>
              <div className="mb-2 text-[13px] text-slate-600">Skip the auction — available until bids reach the Buy Now price.</div>
              <PurchaseActions vehicleId={v.id} buyNowPrice={v.buyNowPrice} canBuyNow canOffer={false} askingPrice={v.expectedPrice} signedIn={!!actor} blockReason={block} loginNext={path} existingOffer={false} />
            </Card>
          )}
        </aside>
        <div className="min-w-0 space-y-5 lg:col-start-1">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Seller</div>
                <Link href={`/dealer/${v.dealer.slug}`} className="text-[16px] font-bold text-ink-900 hover:text-ignite-600">{v.dealer.name}</Link>
                <div className="flex items-center gap-3 text-[13px] text-slate-500">
                  {v.dealer.status === "VERIFIED" && <VerificationBadge />}
                  {v.dealer.ratingCount > 0 && <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{v.dealer.ratingAvg.toFixed(1)}</span>}
                  <span>{v.dealer.district.name}</span>
                </div>
              </div>
              <Link href={vehiclePath(v)} className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:border-ink-900">Specs, condition & inspection</Link>
            </div>
          </Card>
          <Card className="text-[13.5px] text-slate-600">
            <h2 className="mb-2 font-sans text-[15px] font-bold text-ink-900">Auction rules</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Minimum next bid is the current bid plus the bid increment ({formatINR(a.bidIncrement)}).</li>
              <li>Bids in the final {Math.round(a.extendTriggerSec / 60)} minutes extend the auction by {Math.round(a.extendBySec / 60)} minutes.</li>
              <li>{a.reservePrice ? "If the reserve isn't met, the seller may accept the highest bid within 24 hours." : "No reserve — the highest bid wins."}</li>
              <li>The winner must pay within the payment window shown on the order. <Link href="/pages/auction-rules" className="font-semibold underline">Full auction rules</Link></li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
