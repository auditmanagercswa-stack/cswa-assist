import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AlertTriangle, BadgeCheck, CalendarDays, Car, CheckCircle2, ChevronRight, CircleGauge, Droplets, FileText, Fuel, Gauge, KeyRound, MapPin, Palette, Settings2, ShieldCheck, Star, Users, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDate, formatINR, formatNumber, humanize, maskRegistration } from "@/lib/format";
import { vehiclePath } from "@/lib/slug";
import { cn } from "@/lib/cn";
import { getCurrentActor } from "@/server/auth/session";
import { buyBlockReason } from "@/server/auth/rbac";
import { getSetting } from "@/server/settings";
import { auctionSnapshot } from "@/server/services/auctions";
import { cardSelect, getVehicleByCode, recordView, VIEWABLE_STATUSES } from "@/server/services/vehicles";
import { scoreGrade } from "@/server/services/inspections";
import { ImageGallery } from "@/components/vehicles/image-gallery";
import { BidPanel } from "@/components/auction/bid-panel";
import { PurchaseActions } from "@/components/vehicles/purchase-actions";
import { WatchButton } from "@/components/vehicles/watch-button";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { StatusBadge, VerificationBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type P = { make: string; model: string; year: string; code: string };

export async function generateMetadata({ params }: { params: Promise<P> }): Promise<Metadata> {
  const { code } = await params;
  const v = await getVehicleByCode(code);
  if (!v) return { title: "Vehicle not found" };
  const price = v.currentBid ?? v.buyNowPrice ?? v.expectedPrice;
  const desc = `${v.title} · ${formatNumber(v.kmDriven)} km · ${humanize(v.fuel)} · ${humanize(v.transmission)} · ${v.cityName ?? v.district.name}. ${v.status === "AUCTION_LIVE" ? `Live auction, current bid ${formatINR(price)}.` : `Price ${formatINR(price)}.`} Sold by ${v.dealer.name}, a verified dealer on Alpha Cars.`;
  const img = v.images[0]?.url;
  return {
    title: `${v.title} for sale in ${v.cityName ?? v.district.name}`,
    description: desc,
    alternates: { canonical: vehiclePath(v) },
    openGraph: { title: v.title, description: desc, type: "website", images: img ? [{ url: `${env.appUrl}${img}`, width: 1280, height: 960 }] : [] },
    robots: VIEWABLE_STATUSES.includes(v.status) ? undefined : { index: false },
  };
}

const COND_TONE: Record<string, string> = { EXCELLENT: "text-verified-600 bg-verified-50", GOOD: "text-blue-700 bg-blue-50", FAIR: "text-amber-700 bg-amber-50", POOR: "text-red-700 bg-red-50" };

export default async function VehicleDetailPage({ params }: { params: Promise<P> }) {
  const p = await params;
  const v = await getVehicleByCode(p.code);
  if (!v) notFound();
  const actor = await getCurrentActor();
  const isOwner = !!actor?.dealer && actor.dealer.id === v.dealerId;
  const isAdmin = !!actor?.permissions.has("vehicles.manage");
  if (!VIEWABLE_STATUSES.includes(v.status) && !isOwner && !isAdmin) notFound();
  const canonical = vehiclePath(v);
  if (p.make !== v.make.slug || p.model !== v.model.slug || p.year !== String(v.year)) permanentRedirect(canonical);
  if (!isOwner) recordView(v.id).catch(() => {});

  const auction = v.auctions[0];
  const auctionOpen = auction && (auction.status === "LIVE" || auction.status === "SCHEDULED");
  const [snap, watching, existingOffer, individualOn, similar, buyNowOn, offersOn] = await Promise.all([
    auction ? auctionSnapshot(auction.id, actor?.userId) : null,
    actor ? prisma.watchlist.findUnique({ where: { userId_vehicleId: { userId: actor.userId, vehicleId: v.id } } }) : null,
    actor ? prisma.offer.findFirst({ where: { vehicleId: v.id, buyerId: actor.userId, status: { in: ["PENDING", "COUNTERED"] } } }) : null,
    getSetting("features.individualBuyers"),
    prisma.vehicle.findMany({ where: { status: { in: ["PUBLISHED", "AUCTION_LIVE"] }, id: { not: v.id }, OR: [{ modelId: v.modelId }, { bodyType: v.bodyType, expectedPrice: { gte: Math.round(v.expectedPrice * 0.7), lte: Math.round(v.expectedPrice * 1.3) } }] }, take: 4, select: cardSelect, orderBy: { publishedAt: "desc" } }),
    getSetting("features.buyNow"),
    getSetting("features.offers"),
  ]);
  const block = buyBlockReason(actor, v.dealerId, individualOn);
  const available = v.status === "PUBLISHED" || v.status === "AUCTION_LIVE" || v.status === "AUCTION_ENDED";
  const canBuyNow = buyNowOn && v.buyNowEnabled && !!v.buyNowPrice && (v.status === "PUBLISHED" || (v.status === "AUCTION_LIVE" && (v.currentBid ?? 0) < v.buyNowPrice));
  const canOffer = offersOn && v.offersEnabled && (v.status === "PUBLISHED" || v.status === "AUCTION_ENDED") && !auctionOpen;
  const inspection = v.inspections[0];
  const checklist = (inspection?.checklist as { key: string; label: string; rating: number; notes?: string }[] | null) ?? [];
  const loc = [v.cityName, v.district.name, v.state.name].filter(Boolean).join(", ");
  const serverTime = new Date().toISOString();

  const specs: [typeof Car, string, string][] = [
    [CalendarDays, "Manufacture year", String(v.year)],
    [CalendarDays, "Registration year", String(v.registrationYear)],
    [Gauge, "Kilometres", `${formatNumber(v.kmDriven)} km`],
    [Fuel, "Fuel", humanize(v.fuel)],
    [Settings2, "Transmission", humanize(v.transmission)],
    [Users, "Owners", v.owners === 1 ? "1st owner" : `${v.owners} owners`],
    [Palette, "Colour", v.color],
    [Car, "Body type", humanize(v.bodyType)],
    [ShieldCheck, "Insurance", `${humanize(v.insuranceStatus)}${v.insuranceExpiry ? ` · till ${formatDate(v.insuranceExpiry, { month: "short", year: "numeric" })}` : ""}`],
    [FileText, "RC status", humanize(v.rcStatus)],
    [KeyRound, "Registration", isOwner || isAdmin ? (v.registrationNumber ?? "—") : maskRegistration(v.registrationNumber)],
    [MapPin, "Location", `${v.cityName ?? v.district.name} · ${v.pincode}`],
  ];
  const conditions: [string, string][] = [
    ["Overall", v.overallCondition],
    ["Engine", v.engineCondition],
    ["Gearbox", v.gearboxCondition],
    ["Tyres", v.tyreCondition],
    ["Battery", v.batteryCondition],
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Car",
    name: v.title,
    brand: { "@type": "Brand", name: v.make.name },
    model: v.model.name,
    vehicleModelDate: String(v.year),
    productionDate: String(v.year),
    mileageFromOdometer: { "@type": "QuantitativeValue", value: v.kmDriven, unitCode: "KMT" },
    fuelType: humanize(v.fuel),
    vehicleTransmission: humanize(v.transmission),
    color: v.color,
    bodyType: humanize(v.bodyType),
    numberOfPreviousOwners: v.owners - 1,
    itemCondition: "https://schema.org/UsedCondition",
    image: v.images.slice(0, 4).map((i) => `${env.appUrl}${i.url}`),
    url: `${env.appUrl}${canonical}`,
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: v.currentBid ?? v.buyNowPrice ?? v.expectedPrice,
      availability: available ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      seller: { "@type": "AutoDealer", name: v.dealer.name, address: { "@type": "PostalAddress", addressLocality: v.dealer.district.name, addressRegion: v.dealer.state.name, addressCountry: "IN" } },
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 pb-28 sm:px-6 lg:pb-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-[13px] text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-ink-900">Home</Link><ChevronRight className="h-3.5 w-3.5" />
        <Link href="/vehicles" className="hover:text-ink-900">Used cars</Link><ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/vehicles?make=${v.make.slug}`} className="hover:text-ink-900">{v.make.name}</Link><ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/vehicles?make=${v.make.slug}&model=${v.model.slug}`} className="hover:text-ink-900">{v.model.name}</Link>
      </nav>

      {(isOwner || isAdmin) && v.status !== "PUBLISHED" && v.status !== "AUCTION_LIVE" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" /> This listing is <b>{humanize(v.status)}</b> and is not visible in search.{v.statusReason ? ` Note: ${v.statusReason}` : ""}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={v.status} />
              {v.inspectionVerified && <span className="inline-flex items-center gap-1 rounded-full bg-verified-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-verified-600 ring-1 ring-emerald-100"><ShieldCheck className="h-3.5 w-3.5" />Inspected · {v.inspectionScore}/100</span>}
              {v.featuredUntil && v.featuredUntil > new Date() && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-amber-700 ring-1 ring-amber-100">Featured</span>}
            </div>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-[26px] font-bold leading-tight text-ink-900 sm:text-[32px]">{v.make.name} {v.model.name} <span className="text-slate-500">{v.variantName}</span></h1>
              <WatchButton vehicleId={v.id} initial={!!watching} signedIn={!!actor} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-slate-600">
              <span>{v.year}</span>
              <span className="flex items-center gap-1"><Gauge className="h-4 w-4 text-slate-400" />{formatNumber(v.kmDriven)} km</span>
              <span className="flex items-center gap-1"><Fuel className="h-4 w-4 text-slate-400" />{humanize(v.fuel)}</span>
              <span className="flex items-center gap-1"><Settings2 className="h-4 w-4 text-slate-400" />{humanize(v.transmission)}</span>
              <span className="flex items-center gap-1"><MapPin className="h-4 w-4 text-slate-400" />{loc}</span>
            </div>
          </div>
          <ImageGallery images={v.images.map((i) => ({ url: i.url, thumbUrl: i.thumbUrl, alt: i.alt, kind: i.kind }))} title={v.title} />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          {snap && auctionOpen ? (
            <>
              <BidPanel initial={snap} vehicleId={v.id} signedIn={!!actor} blockReason={block} variant="compact" loginNext={canonical} />
              <Link href={`/auctions/${auction.id}`} className="flex items-center justify-center gap-1 text-[13.5px] font-semibold text-ink-900 hover:text-ignite-600">Open live bidding room · bid history & auto-bid <ChevronRight className="h-4 w-4" /></Link>
            </>
          ) : (
            <Card>
              {v.status === "SOLD" || v.status === "RESERVED" ? (
                <div className="text-center">
                  <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">{v.status === "SOLD" ? "Sold" : "Sale in progress"}</div>
                  <div className="mt-1 text-xl font-bold text-ink-900">This vehicle is no longer available</div>
                  <Link href={`/vehicles?make=${v.make.slug}&model=${v.model.slug}`} className="mt-4 inline-flex h-11 items-center rounded-lg bg-ink-900 px-5 text-sm font-bold text-white">See similar {v.model.name}s</Link>
                </div>
              ) : (
                <>
                  <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Asking price</div>
                  <div className="num text-[32px] font-bold text-ink-900">{formatINR(v.expectedPrice)}</div>
                  {snap && auction.status === "ENDED" && <p className="mt-1 text-[13px] text-slate-500">Auction ended{auction.result === "RESERVE_NOT_MET" ? " — reserve not met" : ""}. Offers are open.</p>}
                </>
              )}
            </Card>
          )}
          {available && !isOwner && (canBuyNow || canOffer) && (
            <Card>
              <PurchaseActions vehicleId={v.id} buyNowPrice={v.buyNowPrice} canBuyNow={canBuyNow} canOffer={canOffer} askingPrice={v.expectedPrice} signedIn={!!actor} blockReason={block} loginNext={canonical} existingOffer={!!existingOffer} />
              <div className="mt-3"><WatchButton vehicleId={v.id} initial={!!watching} signedIn={!!actor} variant="full" /></div>
            </Card>
          )}
          {!(available && !isOwner && (canBuyNow || canOffer)) && !isOwner && (
            <WatchButton vehicleId={v.id} initial={!!watching} signedIn={!!actor} variant="full" />
          )}
          {isOwner && (
            <Card className="text-sm">
              <div className="font-semibold text-ink-900">You&apos;re viewing your own listing</div>
              <Link href={`/dashboard/vehicles/${v.id}`} className="mt-2 inline-flex font-semibold text-ignite-600 underline">Manage in dashboard</Link>
            </Card>
          )}

          <Card>
            <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Sold by</div>
            <Link href={`/dealer/${v.dealer.slug}`} className="mt-1 block text-[17px] font-bold text-ink-900 hover:text-ignite-600">{v.dealer.name}</Link>
            {v.dealer.status === "VERIFIED" && <VerificationBadge className="mt-1" />}
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
              <div><dt className="text-slate-500">Rating</dt><dd className="flex items-center gap-1 font-semibold text-ink-900">{v.dealer.ratingCount ? <>{v.dealer.ratingAvg.toFixed(1)}<Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /><span className="font-normal text-slate-400">({v.dealer.ratingCount})</span></> : "New"}</dd></div>
              <div><dt className="text-slate-500">Vehicles sold</dt><dd className="num font-semibold text-ink-900">{formatNumber(v.dealer.soldCount)}</dd></div>
              <div><dt className="text-slate-500">Location</dt><dd className="font-semibold text-ink-900">{v.dealer.district.name}, {v.dealer.state.code ?? v.dealer.state.name}</dd></div>
              <div><dt className="text-slate-500">Member since</dt><dd className="font-semibold text-ink-900">{formatDate(v.dealer.createdAt, { month: "short", year: "numeric" })}</dd></div>
            </dl>
            <p className="mt-3 border-t border-slate-100 pt-3 text-[12px] text-slate-500">Contact details are shared after a confirmed sale to protect both parties.</p>
          </Card>
        </aside>
        <div className="min-w-0 space-y-6 lg:col-start-1">
          <Card>
            <h2 className="mb-4 font-sans text-[17px] font-bold text-ink-900">Specifications</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
              {specs.map(([Icon, label, value]) => (
                <div key={label} className="flex items-start gap-2.5">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <dt className="text-[12px] text-slate-500">{label}</dt>
                    <dd className="text-[14px] font-semibold text-ink-900">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <h2 className="mb-4 font-sans text-[17px] font-bold text-ink-900">Condition</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {conditions.map(([label, val]) => (
                <div key={label} className={cn("rounded-lg px-3 py-2.5", COND_TONE[val])}>
                  <div className="text-[11.5px] font-semibold uppercase tracking-wide opacity-75">{label}</div>
                  <div className="text-[14px] font-bold">{humanize(val)}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-2 text-[14px] sm:grid-cols-3">
              <div className="flex items-center gap-2">{v.accidentHistory ? <XCircle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-verified-500" />}{v.accidentHistory ? "Accident history declared" : "No accident history"}</div>
              <div className="flex items-center gap-2">{v.floodDamage ? <XCircle className="h-4 w-4 text-red-600" /> : <Droplets className="h-4 w-4 text-verified-500" />}{v.floodDamage ? "Flood damage declared" : "No flood damage"}</div>
              <div className="flex items-center gap-2"><CircleGauge className="h-4 w-4 text-slate-400" />Service history: {humanize(v.serviceHistory ?? "NONE")}</div>
            </div>
          </Card>

          {inspection && inspection.score != null && (
            <Card>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="relative h-28 w-28 shrink-0">
                  <svg viewBox="0 0 36 36" className="h-28 w-28 -rotate-90"><circle cx="18" cy="18" r="15.9" fill="none" stroke="#eef0f3" strokeWidth="3" /><circle cx="18" cy="18" r="15.9" fill="none" stroke="#0e9f6e" strokeWidth="3" strokeDasharray={`${inspection.score} 100`} strokeLinecap="round" /></svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="num text-2xl font-bold text-ink-900">{inspection.score}</span><span className="text-[11px] text-slate-500">/100</span></div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-verified-600"><BadgeCheck className="h-4 w-4" />Vehicle Inspection Report</div>
                  <h2 className="mt-1 font-sans text-xl font-bold text-ink-900">{scoreGrade(inspection.score)} condition</h2>
                  <p className="mt-1 text-[14px] text-slate-600">{inspection.summary}</p>
                  <p className="mt-1 text-[12.5px] text-slate-500">Inspected {formatDate(inspection.inspectedAt)} by {inspection.inspectorName}{inspection.odometerVerified ? " · Odometer verified" : ""}</p>
                </div>
                <a href={`/api/inspections/${inspection.id}/report`} target="_blank" rel="noreferrer" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:border-ink-900"><FileText className="h-4 w-4" />Full report (PDF)</a>
              </div>
              {checklist.length > 0 && (
                <div className="mt-5 grid gap-x-8 gap-y-3 border-t border-slate-100 pt-5 sm:grid-cols-2">
                  {checklist.map((c) => (
                    <div key={c.key}>
                      <div className="flex justify-between text-[13px]"><span className="text-slate-600">{c.label}</span><span className="num font-semibold text-ink-900">{c.rating}/10</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className={cn("h-1.5 rounded-full", c.rating >= 8 ? "bg-verified-500" : c.rating >= 6 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${c.rating * 10}%` }} /></div>
                      {c.notes && <div className="mt-0.5 text-[12px] text-slate-500">{c.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {v.description && (
            <Card>
              <h2 className="mb-2 font-sans text-[17px] font-bold text-ink-900">Seller&apos;s description</h2>
              <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-slate-700">{v.description}</p>
            </Card>
          )}

          <Card>
            <h2 className="mb-3 font-sans text-[17px] font-bold text-ink-900">Documents</h2>
            <ul className="grid gap-2 text-[14px] sm:grid-cols-2">
              {[["RC", "Registration certificate"], ["INSURANCE", "Insurance policy"], ["SERVICE_RECORD", "Service records"], ["INSPECTION_REPORT", "Inspection report"]].map(([t, l]) => {
                const has = v.documents.some((d) => d.type === t) || (t === "INSPECTION_REPORT" && !!inspection) || (t === "RC" && v.rcStatus !== "TRANSFER_PENDING");
                return (
                  <li key={t} className="flex items-center gap-2">{has ? <CheckCircle2 className="h-4 w-4 text-verified-500" /> : <XCircle className="h-4 w-4 text-slate-300" />}<span className={has ? "text-slate-700" : "text-slate-400"}>{l}</span></li>
                );
              })}
            </ul>
            <p className="mt-3 text-[12.5px] text-slate-500">Original documents are shared with the buyer after payment. Full registration and chassis numbers are disclosed on the sale agreement.</p>
          </Card>
        </div>

      </div>

      {similar.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-bold text-ink-900">Similar vehicles</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{similar.map((s) => <VehicleCard key={s.id} v={s} signedIn={!!actor} serverTime={serverTime} />)}</div>
        </section>
      )}
    </div>
  );
}
