import Link from "next/link";
import Image from "next/image";
import { Fuel, Gauge, MapPin, Settings2, Gavel, Zap, Sparkles } from "lucide-react";
import type { VehicleCardData } from "@/server/services/vehicles";
import { formatINR, formatINRCompact, formatNumber, humanize } from "@/lib/format";
import { vehiclePath } from "@/lib/slug";
import { InspectionBadge, VerificationBadge } from "../ui/badge";
import { AuctionTimer } from "../auction/auction-timer";
import { WatchButton } from "./watch-button";

export function VehicleCard({ v, watching = false, signedIn = false, serverTime, priority }: { v: VehicleCardData; watching?: boolean; signedIn?: boolean; serverTime?: string; priority?: boolean }) {
  const img = v.images[0];
  const live = v.status === "AUCTION_LIVE" && v.auctionEndAt;
  const featured = v.featuredUntil && new Date(v.featuredUntil) > new Date();
  const href = vehiclePath(v);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-white shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
      <Link href={href} className="relative block aspect-[4/3] overflow-hidden bg-slate-100">
        {img && <Image src={img.thumbUrl ?? img.url} alt={img.alt ?? v.title} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-cover transition duration-500 group-hover:scale-[1.03]" priority={priority} unoptimized />}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {live && (
            <span className="inline-flex items-center gap-1 rounded-md bg-ignite-500 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-white" /> Live
            </span>
          )}
          {featured && (
            <span className="inline-flex items-center gap-1 rounded-md bg-gold-500 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
              <Sparkles className="h-3 w-3" /> Featured
            </span>
          )}
        </div>
        <InspectionBadge score={v.inspectionVerified ? v.inspectionScore : null} className="absolute bottom-3 left-3" />
      </Link>
      <div className="absolute right-3 top-3">
        <WatchButton vehicleId={v.id} initial={watching} signedIn={signedIn} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <Link href={href} className="min-w-0">
          <h3 className="truncate font-sans text-[15.5px] font-bold text-ink-900">
            {v.make.name} {v.model.name}
          </h3>
          <p className="truncate text-[13px] text-slate-500">
            {v.year} · {v.variantName}
          </p>
        </Link>
        <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px] text-slate-600">
          <li className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5 text-slate-400" />{formatNumber(v.kmDriven)} km</li>
          <li className="flex items-center gap-1.5"><Fuel className="h-3.5 w-3.5 text-slate-400" />{humanize(v.fuel)}</li>
          <li className="flex items-center gap-1.5"><Settings2 className="h-3.5 w-3.5 text-slate-400" />{humanize(v.transmission)}</li>
          <li className="flex min-w-0 items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" /><span className="truncate">{v.cityName ?? v.district.name}</span></li>
        </ul>
        <div className="mt-auto pt-4">
          {live ? (
            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <span className="flex items-center gap-1.5">
                  {v.currentBid ? "Current bid" : "Starting bid"}
                  <span className="inline-flex items-center gap-0.5 normal-case tracking-normal text-slate-500"><Gavel className="h-3 w-3" />{v.bidCount}</span>
                </span>
                <AuctionTimer endAt={new Date(v.auctionEndAt!).toISOString()} serverTime={serverTime} compact className="text-[12px] normal-case tracking-normal text-slate-600" />
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="num truncate text-[19px] font-bold text-ink-900">{formatINRCompact(v.currentBid ?? v.minimumBid ?? v.expectedPrice)}</div>
                <Link href={`/auctions/${v.liveAuctionId}`} className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-lg bg-ignite-500 px-3.5 text-[13px] font-bold text-white hover:bg-ignite-600">
                  Bid Now
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{v.buyNowEnabled && v.buyNowPrice ? "Buy now" : "Asking price"}</div>
                <div className="num text-[19px] font-bold text-ink-900">{formatINR(v.buyNowEnabled && v.buyNowPrice ? v.buyNowPrice : v.expectedPrice)}</div>
              </div>
              {v.buyNowEnabled && v.buyNowPrice ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-ink-900 px-2 py-1 text-[11px] font-bold text-white"><Zap className="h-3 w-3 text-ignite-400" />Buy Now</span>
              ) : v.auctionEnabled && v.auctionStartAt && new Date(v.auctionStartAt) > new Date() ? (
                <span className="text-[12px] font-semibold text-blue-700">Auction soon</span>
              ) : null}
            </div>
          )}
          <div className="mt-2.5 flex items-center justify-between text-[12px] text-slate-500">
            <span className="truncate">{v.dealer.name}</span>
            {v.dealer.status === "VERIFIED" && <VerificationBadge label="Verified" className="text-[11.5px]" />}
          </div>
        </div>
      </div>
    </article>
  );
}

export function VehicleGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
}
