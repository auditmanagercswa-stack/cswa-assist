import { prisma, Prisma } from "@/lib/db";

export type SeriesPoint = { label: string; value: number };
type MonthRow = { m: Date; v: number | null };

const PAID_STATES = ["PAYMENT_RECEIVED", "SELLER_CONFIRMED", "DOCUMENTS_PENDING", "VEHICLE_READY", "IN_DELIVERY", "COMPLETED", "DISPUTED"] as const;

function monthLabels(n: number) {
  const out: Date[] = [];
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)));
  return out;
}

function fillMonths(rows: MonthRow[], n = 12): SeriesPoint[] {
  const map = new Map(rows.map((r) => [new Date(r.m).toISOString().slice(0, 7), Number(r.v ?? 0)]));
  return monthLabels(n).map((m) => ({ label: m.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }), value: map.get(m.toISOString().slice(0, 7)) ?? 0 }));
}

const since = (months: number) => {
  const d = monthLabels(months)[0];
  return d;
};

// ───────────────────────── Public ─────────────────────────

const g = globalThis as unknown as { __homeStats?: { at: number; v: HomeStats } };
export type HomeStats = { dealers: number; vehicles: number; transactions: number; transactionValue: number; liveAuctions: number };

export async function homeStats(): Promise<HomeStats> {
  if (g.__homeStats && Date.now() - g.__homeStats.at < 5 * 60_000) return g.__homeStats.v;
  const [dealers, vehicles, tx, liveAuctions] = await Promise.all([
    prisma.dealer.count({ where: { status: "VERIFIED" } }),
    prisma.vehicle.count({ where: { status: { notIn: ["DRAFT", "REJECTED", "CANCELLED"] } } }),
    prisma.order.aggregate({ where: { status: { in: [...PAID_STATES] } }, _count: true, _sum: { vehiclePrice: true } }),
    prisma.auction.count({ where: { status: "LIVE", endAt: { gt: new Date() } } }),
  ]);
  const v = { dealers, vehicles, transactions: tx._count, transactionValue: Number(tx._sum.vehiclePrice ?? 0), liveAuctions };
  g.__homeStats = { at: Date.now(), v };
  return v;
}

// ───────────────────────── Dealer ─────────────────────────

export async function dealerDashboard(dealerId: string, userId: string) {
  const [
    totalListings,
    activeAuctions,
    sold,
    pendingSales,
    salesAgg,
    feeAgg,
    servicePaid,
    outstandingBuy,
    outstandingFees,
    activeBidAuctions,
    wonAuctions,
  ] = await Promise.all([
    prisma.vehicle.count({ where: { dealerId, status: { notIn: ["CANCELLED"] } } }),
    prisma.auction.count({ where: { vehicle: { dealerId }, status: "LIVE" } }),
    prisma.order.count({ where: { sellerDealerId: dealerId, status: { in: [...PAID_STATES] } } }),
    prisma.order.count({ where: { sellerDealerId: dealerId, status: { in: ["PAYMENT_PENDING", "PAYMENT_RECEIVED", "SELLER_CONFIRMED", "DOCUMENTS_PENDING", "VEHICLE_READY", "IN_DELIVERY"] } } }),
    prisma.order.aggregate({ where: { sellerDealerId: dealerId, status: { in: [...PAID_STATES] } }, _sum: { vehiclePrice: true, sellerNet: true } }),
    prisma.order.aggregate({ where: { sellerDealerId: dealerId, status: { in: [...PAID_STATES] } }, _sum: { sellerFee: true, sellerGstAmount: true } }),
    prisma.payment.aggregate({ where: { dealerId, purpose: { not: "ORDER" }, status: "PAID" }, _sum: { amount: true } }),
    prisma.order.aggregate({ where: { OR: [{ buyerDealerId: dealerId }, { buyerId: userId }], status: "PAYMENT_PENDING" }, _sum: { buyerTotal: true }, _count: true }),
    prisma.payment.aggregate({ where: { dealerId, purpose: { not: "ORDER" }, status: { in: ["PENDING", "FAILED"] } }, _sum: { amount: true } }),
    prisma.bid.findMany({ where: { OR: [{ dealerId }, { bidderId: userId }], auction: { status: "LIVE" } }, distinct: ["auctionId"], select: { auctionId: true } }),
    prisma.order.count({ where: { OR: [{ buyerDealerId: dealerId }, { buyerId: userId }], source: "AUCTION" } }),
  ]);
  return {
    totalListings,
    activeAuctions,
    sold,
    pendingSales,
    totalSalesValue: Number(salesAgg._sum.vehiclePrice ?? 0),
    netReceivable: Number(salesAgg._sum.sellerNet ?? 0),
    platformFees: Number(feeAgg._sum.sellerFee ?? 0) + Number(feeAgg._sum.sellerGstAmount ?? 0) + Number(servicePaid._sum.amount ?? 0),
    outstandingPayments: Number(outstandingBuy._sum.buyerTotal ?? 0) + Number(outstandingFees._sum.amount ?? 0),
    outstandingOrders: outstandingBuy._count,
    activeBids: activeBidAuctions.length,
    wonAuctions,
  };
}

export async function dealerCharts(dealerId: string) {
  const from = since(12);
  const [salesCount, salesValue, listings, avgPrice, auctionResults] = await Promise.all([
    prisma.$queryRaw<MonthRow[]>`SELECT date_trunc('month', "createdAt") m, COUNT(*)::float8 v FROM "Order"
      WHERE "sellerDealerId" = ${dealerId} AND status::text = ANY(${PAID_STATES as unknown as string[]}) AND "createdAt" >= ${from} GROUP BY 1`,
    prisma.$queryRaw<MonthRow[]>`SELECT date_trunc('month', "createdAt") m, SUM("sellerNet")::float8 v FROM "Order"
      WHERE "sellerDealerId" = ${dealerId} AND status::text = ANY(${PAID_STATES as unknown as string[]}) AND "createdAt" >= ${from} GROUP BY 1`,
    prisma.$queryRaw<MonthRow[]>`SELECT date_trunc('month', "createdAt") m, COUNT(*)::float8 v FROM "Vehicle"
      WHERE "dealerId" = ${dealerId} AND "createdAt" >= ${from} GROUP BY 1`,
    prisma.$queryRaw<MonthRow[]>`SELECT date_trunc('month', "createdAt") m, AVG("vehiclePrice")::float8 v FROM "Order"
      WHERE "sellerDealerId" = ${dealerId} AND status::text = ANY(${PAID_STATES as unknown as string[]}) AND "createdAt" >= ${from} GROUP BY 1`,
    prisma.auction.groupBy({ by: ["result"], where: { vehicle: { dealerId }, status: "ENDED" }, _count: true }),
  ]);
  return {
    salesByMonth: fillMonths(salesCount),
    revenueByMonth: fillMonths(salesValue),
    listingsByMonth: fillMonths(listings),
    avgPriceByMonth: fillMonths(avgPrice),
    auctionPerformance: auctionResults.map((r) => ({ label: (r.result ?? "UNKNOWN").replace(/_/g, " "), value: r._count })),
  };
}

export async function dealerAnalytics(dealerId: string) {
  const from = since(6);
  const [views, enquiries, watch, bidAgg, listed, sold, revenue, fees, topVehicles, viewsByMonth] = await Promise.all([
    prisma.vehicle.aggregate({ where: { dealerId }, _sum: { viewCount: true } }),
    prisma.offer.count({ where: { sellerDealerId: dealerId } }),
    prisma.vehicle.aggregate({ where: { dealerId }, _sum: { watchCount: true } }),
    prisma.bid.aggregate({ where: { auction: { vehicle: { dealerId } }, status: "VALID" }, _count: true, _avg: { amount: true } }),
    prisma.vehicle.count({ where: { dealerId, publishedAt: { not: null } } }),
    prisma.order.count({ where: { sellerDealerId: dealerId, status: { in: [...PAID_STATES] } } }),
    prisma.order.aggregate({ where: { sellerDealerId: dealerId, status: { in: [...PAID_STATES] } }, _sum: { vehiclePrice: true, sellerNet: true, sellerFee: true, sellerGstAmount: true } }),
    prisma.payment.aggregate({ where: { dealerId, purpose: { not: "ORDER" }, status: "PAID" }, _sum: { amount: true } }),
    prisma.vehicle.findMany({
      where: { dealerId, status: { notIn: ["CANCELLED", "DRAFT"] } },
      orderBy: { viewCount: "desc" },
      take: 10,
      select: { id: true, code: true, title: true, status: true, viewCount: true, watchCount: true, enquiryCount: true, bidCount: true, currentBid: true, expectedPrice: true },
    }),
    prisma.$queryRaw<MonthRow[]>`SELECT date_trunc('month', s.day) m, SUM(s.views)::float8 v FROM "VehicleDailyStat" s JOIN "Vehicle" v ON v.id = s."vehicleId"
      WHERE v."dealerId" = ${dealerId} AND s.day >= ${from} GROUP BY 1`,
  ]);
  return {
    views: Number(views._sum.viewCount ?? 0),
    enquiries,
    watchlists: Number(watch._sum.watchCount ?? 0),
    bids: bidAgg._count,
    avgBid: Math.round(Number(bidAgg._avg.amount ?? 0)),
    conversion: listed ? Math.round((sold / listed) * 1000) / 10 : 0,
    sales: sold,
    revenue: Number(revenue._sum.vehiclePrice ?? 0),
    netRevenue: Number(revenue._sum.sellerNet ?? 0),
    fees: Number(revenue._sum.sellerFee ?? 0) + Number(revenue._sum.sellerGstAmount ?? 0) + Number(fees._sum.amount ?? 0),
    topVehicles,
    viewsByMonth: fillMonths(viewsByMonth, 6),
  };
}

// ───────────────────────── Admin ─────────────────────────

export async function adminDashboard() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [dealers, verified, vehicles, activeAuctions, todaysBids, todaysTx, gmv, revenue, serviceRevenue, pendingPay, pendingKyc, disputes, pendingVehicles, openFlags] = await Promise.all([
    prisma.dealer.count(),
    prisma.dealer.count({ where: { status: "VERIFIED" } }),
    prisma.vehicle.count({ where: { status: { notIn: ["DRAFT", "CANCELLED"] } } }),
    prisma.auction.count({ where: { status: "LIVE" } }),
    prisma.bid.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.order.aggregate({ where: { status: { in: [...PAID_STATES] } }, _sum: { vehiclePrice: true } }),
    prisma.order.aggregate({ where: { status: { in: [...PAID_STATES] } }, _sum: { buyerFee: true, sellerFee: true } }),
    prisma.payment.aggregate({ where: { purpose: { not: "ORDER" }, status: "PAID" }, _sum: { amount: true } }),
    prisma.order.aggregate({ where: { status: "PAYMENT_PENDING" }, _count: true, _sum: { buyerTotal: true } }),
    prisma.dealer.count({ where: { status: "UNDER_REVIEW" } }),
    prisma.dispute.count({ where: { status: { in: ["OPEN", "INVESTIGATING", "AWAITING_DOCUMENTS"] } } }),
    prisma.vehicle.count({ where: { status: "PENDING_APPROVAL" } }),
    prisma.fraudFlag.count({ where: { status: "OPEN" } }),
  ]);
  const gstBps = 1800;
  return {
    dealers,
    verified,
    vehicles,
    activeAuctions,
    todaysBids,
    todaysTx,
    gmv: Number(gmv._sum.vehiclePrice ?? 0),
    revenue: Number(revenue._sum.buyerFee ?? 0) + Number(revenue._sum.sellerFee ?? 0) + Math.round((Number(serviceRevenue._sum.amount ?? 0) * 10000) / (10000 + gstBps)),
    pendingPayments: pendingPay._count,
    pendingPaymentsValue: Number(pendingPay._sum.buyerTotal ?? 0),
    pendingKyc,
    disputes,
    pendingVehicles,
    openFlags,
  };
}

export async function adminCharts() {
  const from = since(12);
  const paid = PAID_STATES as unknown as string[];
  const [gmv, revenue, listings, wonAuctions, activeDealers, geo] = await Promise.all([
    prisma.$queryRaw<MonthRow[]>`SELECT date_trunc('month', "createdAt") m, SUM("vehiclePrice")::float8 v FROM "Order" WHERE status::text = ANY(${paid}) AND "createdAt" >= ${from} GROUP BY 1`,
    prisma.$queryRaw<MonthRow[]>`SELECT date_trunc('month', "createdAt") m, SUM("buyerFee" + "sellerFee")::float8 v FROM "Order" WHERE status::text = ANY(${paid}) AND "createdAt" >= ${from} GROUP BY 1`,
    prisma.$queryRaw<MonthRow[]>`SELECT date_trunc('month', "createdAt") m, COUNT(*)::float8 v FROM "Vehicle" WHERE "createdAt" >= ${from} GROUP BY 1`,
    prisma.$queryRaw<MonthRow[]>`SELECT date_trunc('month', "closedAt") m, COUNT(*)::float8 v FROM "Auction" WHERE result = 'WON' AND "closedAt" >= ${from} GROUP BY 1`,
    prisma.$queryRaw<MonthRow[]>`SELECT m, COUNT(DISTINCT d)::float8 v FROM (
        SELECT date_trunc('month', "createdAt") m, "dealerId" d FROM "Vehicle" WHERE "createdAt" >= ${from}
        UNION ALL SELECT date_trunc('month', "createdAt") m, "dealerId" d FROM "Bid" WHERE "createdAt" >= ${from} AND "dealerId" IS NOT NULL
      ) x GROUP BY m`,
    prisma.$queryRaw<{ state: string; district: string; vehicles: number; sold: number }[]>`
      SELECT s.name state, d.name district, COUNT(v.id)::int vehicles, COUNT(v.id) FILTER (WHERE v.status = 'SOLD')::int sold
      FROM "Vehicle" v JOIN "State" s ON s.id = v."stateId" JOIN "District" d ON d.id = v."districtId"
      WHERE v.status <> 'DRAFT' GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 12`,
  ]);
  return {
    gmvByMonth: fillMonths(gmv),
    revenueByMonth: fillMonths(revenue),
    listingsByMonth: fillMonths(listings),
    successfulAuctionsByMonth: fillMonths(wonAuctions),
    activeDealersByMonth: fillMonths(activeDealers),
    geo,
  };
}

export async function adminReportMetrics() {
  const [ended, won, withBids, converted, asp, turnover] = await Promise.all([
    prisma.auction.count({ where: { status: "ENDED" } }),
    prisma.auction.count({ where: { status: "ENDED", result: { in: ["WON", "SOLD_BUY_NOW"] } } }),
    prisma.auction.count({ where: { status: "ENDED", bidCount: { gt: 0 } } }),
    prisma.order.count({ where: { source: "AUCTION", status: { in: [...PAID_STATES] } } }),
    prisma.order.aggregate({ where: { status: { in: [...PAID_STATES] } }, _avg: { vehiclePrice: true } }),
    prisma.$queryRaw<{ days: number | null }[]>(Prisma.sql`SELECT AVG(EXTRACT(EPOCH FROM ("soldAt" - "publishedAt")) / 86400)::float8 days FROM "Vehicle" WHERE "soldAt" IS NOT NULL AND "publishedAt" IS NOT NULL`),
  ]);
  return {
    auctionSuccessRate: ended ? Math.round((won / ended) * 1000) / 10 : 0,
    bidToSaleConversion: withBids ? Math.round((converted / withBids) * 1000) / 10 : 0,
    averageSellingPrice: Math.round(Number(asp._avg.vehiclePrice ?? 0)),
    vehicleTurnoverDays: Math.round((turnover[0]?.days ?? 0) * 10) / 10,
    endedAuctions: ended,
  };
}
