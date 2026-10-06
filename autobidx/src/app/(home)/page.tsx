import Link from "next/link";
import { ArrowRight, BadgeCheck, CarFront, ClipboardCheck, FileCheck2, Gavel, Lock, ShieldCheck, Sparkles, Star, Timer, Trophy, TrendingUp, UserPlus, Wallet, Zap } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentActor } from "@/server/auth/session";
import { getMakes, getStates } from "@/server/services/catalog";
import { homeStats } from "@/server/services/analytics";
import { cardSelect } from "@/server/services/vehicles";
import { listBanners, listFaqs, listTestimonials } from "@/server/services/cms";
import { SearchBar } from "@/components/vehicles/search-bar";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { DealerCard } from "@/components/vehicles/dealer-card";
import { CarArt } from "@/components/vehicles/car-art";
import { ButtonLink } from "@/components/ui/button";
import { AuctionTimer } from "@/components/auction/auction-timer";
import { formatINR, formatINRCompact, formatNumber } from "@/lib/format";
import { env } from "@/lib/env";

export const revalidate = 0;

const CATEGORIES: [string, string][] = [
  ["All Cars", "/vehicles"],
  ["SUVs", "/vehicles?body=SUV"],
  ["Sedans", "/vehicles?body=SEDAN"],
  ["Hatchbacks", "/vehicles?body=HATCHBACK"],
  ["Luxury", "/vehicles?luxury=true"],
  ["MUVs", "/vehicles?body=MUV"],
  ["Commercial", "/vehicles?body=COMMERCIAL,PICKUP"],
  ["EV", "/vehicles?fuel=ELECTRIC"],
  ["Automatic", "/vehicles?transmission=AUTOMATIC,AMT,CVT,DCT"],
  ["Diesel", "/vehicles?fuel=DIESEL"],
  ["Petrol", "/vehicles?fuel=PETROL"],
  ["CNG", "/vehicles?fuel=CNG"],
  ["Hybrid", "/vehicles?fuel=HYBRID"],
];

function statValue(n: number, floor: number) {
  // Shows real DB numbers; rounds down to a friendly "n+" once volumes grow.
  if (n >= floor) return `${formatNumber(Math.floor(n / floor) * floor)}+`;
  return formatNumber(n);
}

export default async function HomePage() {
  const actor = await getCurrentActor();
  const now = new Date();
  const [makes, states, stats, live, featured, dealers, testimonials, faqs, promos, watch, hot] = await Promise.all([
    getMakes(),
    getStates(),
    homeStats(),
    prisma.vehicle.findMany({ where: { status: "AUCTION_LIVE", auctionEndAt: { gt: now } }, orderBy: { auctionEndAt: "asc" }, take: 8, select: cardSelect }),
    prisma.vehicle.findMany({ where: { status: { in: ["PUBLISHED", "AUCTION_LIVE"] }, featuredUntil: { gt: now } }, orderBy: { featuredUntil: "desc" }, take: 4, select: cardSelect }),
    prisma.dealer.findMany({
      where: { status: "VERIFIED" },
      orderBy: [{ ratingAvg: "desc" }, { soldCount: "desc" }],
      take: 4,
      select: { slug: true, name: true, ratingAvg: true, ratingCount: true, soldCount: true, createdAt: true, district: { select: { name: true } }, state: { select: { name: true } }, _count: { select: { vehicles: { where: { status: { in: ["PUBLISHED", "AUCTION_LIVE"] } } } } } },
    }),
    listTestimonials(),
    listFaqs(),
    listBanners("HOME_PROMO"),
    actor ? prisma.watchlist.findMany({ where: { userId: actor.userId }, select: { vehicleId: true } }) : [],
    prisma.vehicle.findFirst({ where: { status: "AUCTION_LIVE", auctionEndAt: { gt: now } }, orderBy: { bidCount: "desc" }, select: { title: true, currentBid: true, bidCount: true, auctionEndAt: true, liveAuctionId: true } }),
  ]);
  const watching = new Set(watch.map((w) => w.vehicleId));
  const serverTime = now.toISOString();
  const featuredList = featured.length >= 4 ? featured : [...featured, ...(await prisma.vehicle.findMany({ where: { status: "PUBLISHED", inspectionVerified: true, id: { notIn: featured.map((f) => f.id) } }, orderBy: { inspectionScore: "desc" }, take: 4 - featured.length, select: cardSelect }))];

  return (
    <>
      {/* ───────── HERO ───────── */}
      <section className="relative overflow-hidden bg-ink-950 pb-20 pt-28 text-white sm:pb-28 sm:pt-32">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_75%_30%,rgba(242,85,29,0.22),transparent_60%),radial-gradient(ellipse_50%_50%_at_10%_90%,rgba(42,120,214,0.18),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12.5px] font-semibold text-white/80 backdrop-blur">
              <span className="h-2 w-2 animate-pulse-soft rounded-full bg-ignite-500" />
              {stats.liveAuctions} live auctions right now
            </div>
            <h1 className="mt-5 text-[40px] font-bold leading-[1.05] sm:text-[56px] lg:text-[62px]">
              India&apos;s Smarter <span className="whitespace-nowrap text-ignite-400">Used-Car</span> Marketplace
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-white/75 sm:text-lg">
              Buy used cars from verified dealers through competitive bidding. Thousands of verified vehicles. Competitive bidding. Transparent transactions.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/vehicles" size="xl">Browse Vehicles <ArrowRight className="h-5 w-5" /></ButtonLink>
              <ButtonLink href={actor ? "/dashboard/vehicles/new" : "/register"} size="xl" variant="light">Sell Your Vehicle</ButtonLink>
              <ButtonLink href="/register" size="xl" variant="light" className="hidden sm:inline-flex">Join as Dealer</ButtonLink>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-white/60">
              <span className="flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-emerald-400" />KYC-verified dealers</span>
              <span className="flex items-center gap-1.5"><Lock className="h-4 w-4 text-emerald-400" />Server-verified bids</span>
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-400" />Secure payments</span>
            </div>
          </div>
          <div className="relative">
            <div className="relative aspect-[16/10] overflow-hidden rounded-3xl ring-1 ring-white/10 shadow-2xl shadow-black/50">
              <CarArt kind="SUV" color="#e9ecef" scene="showroom" seed={4242} className="absolute inset-0" />
            </div>
            {hot && (
              <Link href={`/auctions/${hot.liveAuctionId}`} className="absolute -bottom-6 left-4 right-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white p-4 text-ink-900 shadow-2xl sm:left-auto sm:right-[-12px] sm:w-80">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ignite-600"><span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ignite-500" />Hottest auction</div>
                  <div className="truncate text-[14px] font-bold">{hot.title}</div>
                  <div className="mt-0.5 flex items-center gap-3 text-[12px] text-slate-500">
                    <span>{hot.bidCount} bids</span>
                    <AuctionTimer endAt={hot.auctionEndAt!.toISOString()} serverTime={serverTime} compact />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-400">Current bid</div>
                  <div className="num whitespace-nowrap text-lg font-bold">{formatINRCompact(hot.currentBid)}</div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ───────── SEARCH ───────── */}
      <section className="relative z-10 mx-auto -mt-10 max-w-6xl px-4 sm:px-6">
        <SearchBar makes={makes.map((m) => ({ id: m.id, name: m.name, slug: m.slug }))} states={states} />
        <div className="scroll-rail mt-4 flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map(([label, href]) => (
            <Link key={label} href={href} className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13.5px] font-semibold text-ink-900 shadow-sm transition hover:border-ink-900">
              {label}
            </Link>
          ))}
        </div>
      </section>

      {promos[0] && (
        <section className="mx-auto mt-10 max-w-7xl px-4 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-gradient-to-r from-ignite-500 to-ignite-600 p-6 text-white sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-1 h-6 w-6 shrink-0" />
              <div>
                <div className="font-display text-xl font-bold">{promos[0].title}</div>
                {promos[0].subtitle && <div className="text-[14px] text-white/85">{promos[0].subtitle}</div>}
              </div>
            </div>
            {promos[0].ctaHref && <ButtonLink href={promos[0].ctaHref} variant="dark">{promos[0].ctaLabel ?? "Learn more"}</ButtonLink>}
          </div>
        </section>
      )}

      {/* ───────── LIVE AUCTIONS ───────── */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-ignite-600"><span className="h-2 w-2 animate-pulse-soft rounded-full bg-ignite-500" />Live auctions</div>
            <h2 className="mt-1 text-[28px] font-bold text-ink-900 sm:text-[34px]">Ending soon — bid before the hammer falls</h2>
          </div>
          <Link href="/auctions" className="hidden shrink-0 items-center gap-1 text-sm font-bold text-ink-900 hover:text-ignite-600 sm:flex">All live auctions <ArrowRight className="h-4 w-4" /></Link>
        </div>
        {live.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {live.map((v, i) => <VehicleCard key={v.id} v={v} watching={watching.has(v.id)} signedIn={!!actor} serverTime={serverTime} priority={i < 2} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">No live auctions at the moment — new auctions start every day.</div>
        )}
        <Link href="/auctions" className="mt-4 flex items-center justify-center gap-1 text-sm font-bold text-ink-900 sm:hidden">All live auctions <ArrowRight className="h-4 w-4" /></Link>
      </section>

      {/* ───────── FEATURED ───────── */}
      {featuredList.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wider text-gold-500">Featured</div>
              <h2 className="mt-1 text-[28px] font-bold text-ink-900 sm:text-[34px]">Handpicked, inspected, ready to drive</h2>
            </div>
            <Link href="/vehicles?inspected=true" className="hidden items-center gap-1 text-sm font-bold text-ink-900 hover:text-ignite-600 sm:flex">View inspected cars <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featuredList.map((v) => <VehicleCard key={v.id} v={v} watching={watching.has(v.id)} signedIn={!!actor} serverTime={serverTime} />)}
          </div>
        </section>
      )}

      {/* ───────── HOW IT WORKS ───────── */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6">
        <div className="text-center">
          <div className="text-[12px] font-bold uppercase tracking-wider text-ignite-600">How it works</div>
          <h2 className="mt-1 text-[28px] font-bold text-ink-900 sm:text-[34px]">From listing to handover, in one place</h2>
        </div>
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {[
            { who: "For sellers", icon: CarFront, steps: [["Register", "Create your dealer account in 2 minutes."], ["Verify dealership", "Upload PAN, GST & bank details for KYC."], ["List vehicle", "Photos, documents, reserve & auction timing."], ["Receive bids", "Watch bids arrive live; accept offers."], ["Sell", "Get paid after the buyer confirms delivery."]] },
            { who: "For buyers", icon: Gavel, steps: [["Register", "Join with your dealership details."], ["Verify account", "KYC unlocks bidding and buying."], ["Browse vehicles", "Filter thousands of inspected listings."], ["Bid", "Bid manually or set a proxy maximum."], ["Win", "Get notified the instant the hammer falls."], ["Pay & collect", "Pay securely, collect with full documents."]] },
          ].map((col) => (
            <div key={col.who} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-900 text-white"><col.icon className="h-5 w-5" /></div>
                <h3 className="text-2xl font-bold text-ink-900">{col.who}</h3>
              </div>
              <ol className="mt-6 space-y-4">
                {col.steps.map(([t, d], i) => (
                  <li key={t} className="flex gap-4">
                    <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ignite-50 text-[13px] font-bold text-ignite-700">{i + 1}</span>
                    <div>
                      <div className="font-semibold text-ink-900">{t}</div>
                      <div className="text-[14px] text-slate-500">{d}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── TRUST ───────── */}
      <section className="mt-20 bg-ink-900 py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <div className="text-[12px] font-bold uppercase tracking-wider text-ignite-400">Built on trust</div>
            <h2 className="mt-1 text-[28px] font-bold sm:text-[34px]">Every safeguard a serious dealer expects</h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              [BadgeCheck, "Verified dealers", "PAN, GST, registration & bank checks before anyone can bid or sell."],
              [ClipboardCheck, "Vehicle inspection", "11-area inspection checklist with a scored report on the listing."],
              [Lock, "Secure payments", "Gateway-verified payments; payouts released after delivery."],
              [Gavel, "Transparent bidding", "Server-validated bids, anti-sniping extensions, anonymised history."],
              [FileCheck2, "Digital documentation", "Invoices, sale agreement, challan and receipts — generated instantly."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof BadgeCheck;
              return (
                <div key={t as string} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <I className="h-7 w-7 text-ignite-400" />
                  <div className="mt-4 text-[16px] font-bold">{t as string}</div>
                  <div className="mt-1.5 text-[13.5px] leading-relaxed text-white/60">{d as string}</div>
                </div>
              );
            })}
          </div>
          {/* Statistics — live from the database */}
          <div className="mt-14 grid grid-cols-2 gap-6 border-t border-white/10 pt-10 md:grid-cols-4">
            {[
              [statValue(stats.dealers, 1000), "Verified dealers"],
              [statValue(stats.vehicles, 1000), "Vehicles listed"],
              [statValue(stats.transactions, 1000), "Successful transactions"],
              [stats.transactionValue >= 1_00_00_000 ? `₹${(stats.transactionValue / 1_00_00_000).toFixed(1)} Cr+` : formatINRCompact(stats.transactionValue), "Transaction value"],
            ].map(([v, l]) => (
              <div key={l}>
                <div className="num font-display text-[40px] font-bold leading-none text-white sm:text-[48px]">{v}</div>
                <div className="mt-2 text-[13.5px] text-white/60">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── VERIFIED DEALERS ───────── */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-wider text-verified-600">Verified dealers</div>
            <h2 className="mt-1 text-[28px] font-bold text-ink-900 sm:text-[34px]">Top-rated dealerships</h2>
          </div>
          <Link href="/dealers" className="hidden items-center gap-1 text-sm font-bold text-ink-900 hover:text-ignite-600 sm:flex">All dealers <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{dealers.map((d) => <DealerCard key={d.slug} d={d} />)}</div>
      </section>

      {/* ───────── WHY ───────── */}
      <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-wider text-ignite-600">Why AutoBidX</div>
            <h2 className="mt-1 text-[28px] font-bold text-ink-900 sm:text-[34px]">Designed for how dealers actually trade</h2>
            <p className="mt-3 text-slate-600">Classified listings leave you chasing calls. AutoBidX turns trade-ins into a competitive, time-boxed market — with the paperwork handled.</p>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {[
                [TrendingUp, "Better prices", "Competition among verified buyers lifts final prices above typical trade-in quotes."],
                [Timer, "Faster turnover", "Auctions typically run 24 hours, with a 48-hour payment window."],
                [Zap, "Proxy bidding", "Set your maximum once. We bid only what's needed."],
                [Wallet, "Transparent fees", "Every rupee of fees and GST shown before you commit."],
              ].map(([Icon, t, d]) => {
                const I = Icon as typeof Zap;
                return (
                  <div key={t as string} className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ignite-50 text-ignite-600"><I className="h-5 w-5" /></div>
                    <div>
                      <div className="font-bold text-ink-900">{t as string}</div>
                      <div className="text-[14px] text-slate-500">{d as string}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[var(--shadow-lift)]">
            <div className="text-[12px] font-bold uppercase tracking-wider text-slate-400">Example transaction</div>
            <div className="mt-1 text-lg font-bold text-ink-900">Winning bid of ₹6,00,000</div>
            <dl className="mt-4 divide-y divide-slate-100 text-[14px]">
              {[["Vehicle price", 600000], ["Buyer platform fee (0.5%)", 3000], ["Processing fee", 1000], ["GST on fees (18%)", 720]].map(([l, v]) => (
                <div key={l} className="flex justify-between py-2.5"><dt className="text-slate-600">{l}</dt><dd className="num font-semibold">{formatINR(v as number)}</dd></div>
              ))}
              <div className="flex justify-between py-3 text-[15px]"><dt className="font-bold">Total buyer payable</dt><dd className="num font-bold">{formatINR(604720)}</dd></div>
              <div className="flex justify-between py-2.5"><dt className="text-slate-600">Seller platform fee (1%)</dt><dd className="num font-semibold">− {formatINR(6000)}</dd></div>
              <div className="flex justify-between py-3 text-[15px]"><dt className="font-bold text-verified-600">Seller net receivable</dt><dd className="num font-bold text-verified-600">{formatINR(594000)}</dd></div>
            </dl>
            <p className="mt-2 text-[12px] text-slate-400">Illustrative, at standard plan rates. Exact fees are computed by the server for every transaction.</p>
          </div>
        </div>
      </section>

      {/* ───────── TESTIMONIALS ───────── */}
      {testimonials.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-20 sm:px-6">
          <h2 className="text-center text-[28px] font-bold text-ink-900 sm:text-[34px]">Dealers who trade on AutoBidX</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {testimonials.map((t) => (
              <figure key={t.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-[var(--shadow-card)]">
                <div className="flex gap-0.5">{Array.from({ length: t.rating }, (_, i) => <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />)}</div>
                <blockquote className="mt-3 flex-1 font-display text-[16px] leading-relaxed text-ink-900">“{t.quote}”</blockquote>
                <figcaption className="mt-4 text-[13px]">
                  <div className="font-bold text-ink-900">{t.name}</div>
                  <div className="text-slate-500">{t.dealership}, {t.city}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* ───────── FAQ ───────── */}
      <section className="mx-auto max-w-3xl px-4 pt-20 sm:px-6">
        <h2 className="text-center text-[28px] font-bold text-ink-900 sm:text-[34px]">Frequently asked questions</h2>
        <div className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {faqs.map((f) => (
            <details key={f.id} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink-900">
                {f.question}
                <span className="text-xl text-slate-400 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600">{f.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ───────── DEALER CTA ───────── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-ink-900 px-6 py-12 text-white sm:px-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_90%_10%,rgba(242,85,29,0.35),transparent_60%)]" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <Trophy className="h-9 w-9 text-ignite-400" />
              <h2 className="mt-4 text-[30px] font-bold leading-tight sm:text-[38px]">Your next 100 trade-ins deserve a real market.</h2>
              <p className="mt-3 max-w-xl text-white/70">Join verified dealers across Kerala and India. Free plan includes 10 active listings — upgrade when you&apos;re ready.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <ButtonLink href="/register" size="xl"><UserPlus className="h-5 w-5" /> Join as Dealer</ButtonLink>
              <ButtonLink href="/vehicles" size="xl" variant="light">Browse Vehicles</ButtonLink>
            </div>
          </div>
        </div>
        {env.appMode !== "production" && (
          <p className="mt-6 text-center text-[12.5px] text-slate-400">
            Demo environment · try <Link href="/login" className="font-semibold text-slate-600 underline">signing in with a demo account</Link>.
          </p>
        )}
      </section>
    </>
  );
}
