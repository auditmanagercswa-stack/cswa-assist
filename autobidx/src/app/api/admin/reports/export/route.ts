import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, parseQuery } from "@/server/http";
import { adminGuard } from "../../_guard";
import { audit } from "@/server/audit";

function csv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = c == null ? "" : String(c);
          // Neutralise spreadsheet formula injection.
          const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
          return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(","),
    )
    .join("\n");
}

export const GET = route(async ({ req, actor }) => {
  const a = adminGuard(actor, "reports.view");
  const { type } = parseQuery(req, z.object({ type: z.enum(["orders", "payments", "dealers"]) }));
  let body = "";
  if (type === "orders") {
    const rows = await prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 10000, include: { vehicle: { select: { title: true } }, sellerDealer: { select: { name: true } }, buyerDealer: { select: { name: true } } } });
    body = csv([["Order", "Date", "Source", "Vehicle", "Seller", "Buyer", "Price", "Buyer fee", "Seller fee", "GST", "Buyer total", "Seller net", "Status", "Payment"], ...rows.map((o) => [o.orderNumber, o.createdAt.toISOString(), o.source, o.vehicle.title, o.sellerDealer.name, o.buyerDealer?.name, o.vehiclePrice, o.buyerFee, o.sellerFee, o.gstAmount + o.sellerGstAmount, o.buyerTotal, o.sellerNet, o.status, o.paymentStatus])]);
  } else if (type === "payments") {
    const rows = await prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 10000 });
    body = csv([["Reference", "Date", "Purpose", "Amount", "Refunded", "Method", "Gateway", "Status", "Gateway ref"], ...rows.map((p) => [p.reference, p.createdAt.toISOString(), p.purpose, p.amount, p.refundedAmount, p.method, p.gateway, p.status, p.gatewayPaymentId])]);
  } else {
    const rows = await prisma.dealer.findMany({ orderBy: { createdAt: "desc" }, take: 20000, include: { state: true, district: true } });
    body = csv([["Dealer", "Status", "State", "District", "Sold", "Bought", "Rating", "Joined"], ...rows.map((d) => [d.name, d.status, d.state.name, d.district.name, d.soldCount, d.boughtCount, d.ratingAvg, d.createdAt.toISOString()])]);
  }
  await audit({ userId: a.userId, action: "report.export", entityType: "Report", entityId: type });
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="autobidx-${type}-${new Date().toISOString().slice(0, 10)}.csv"` } });
});
