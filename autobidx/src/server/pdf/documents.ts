import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * PDF generation for transaction documents. Typeset in a classic serif (Times family — the
 * closest standard PDF face to Book Antiqua, so no font files need embedding).
 * Standard PDF fonts are WinAnsi-encoded, so the rupee sign is written as "Rs.".
 */

const INK = rgb(0.043, 0.071, 0.125);
const MUTED = rgb(0.38, 0.42, 0.48);
const ACCENT = rgb(0.92, 0.36, 0.13);
const GOLD = rgb(0.72, 0.59, 0.24);
const LINE = rgb(0.86, 0.87, 0.9);

export function rs(n: number | null | undefined) {
  if (n == null) return "-";
  return "Rs. " + new Intl.NumberFormat("en-IN").format(Math.round(n));
}

function ascii(s: string) {
  // Keep WinAnsi-safe text.
  return s.replace(/₹/g, "Rs.").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\n]/g, "");
}

type Ctx = { doc: PDFDocument; page: PDFPage; font: PDFFont; bold: PDFFont; italic: PDFFont; y: number; width: number; margin: number };

async function begin(title: string, subtitle: string, meta: [string, string][]): Promise<Ctx> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Alpha Cars — ${title}`);
  doc.setProducer("Alpha Cars");
  doc.setCreator("Alpha Cars Platform");
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const { width, height } = page.getSize();
  const margin = 48;
  // Letterhead band
  page.drawRectangle({ x: 0, y: height - 92, width, height: 92, color: INK });
  page.drawRectangle({ x: 0, y: height - 95, width, height: 3, color: GOLD });
  page.drawText("Auto", { x: margin, y: height - 52, size: 26, font: bold, color: rgb(1, 1, 1) });
  page.drawText("BidX", { x: margin + bold.widthOfTextAtSize("Auto", 26), y: height - 52, size: 26, font: bold, color: ACCENT });
  page.drawText("Buy Smarter. Sell Faster.", { x: margin, y: height - 72, size: 10, font: italic, color: rgb(0.8, 0.82, 0.86) });
  const tw = bold.widthOfTextAtSize(ascii(title).toUpperCase(), 15);
  page.drawText(ascii(title).toUpperCase(), { x: width - margin - tw, y: height - 50, size: 15, font: bold, color: rgb(1, 1, 1) });
  const sw = font.widthOfTextAtSize(ascii(subtitle), 10);
  page.drawText(ascii(subtitle), { x: width - margin - sw, y: height - 68, size: 10, font, color: rgb(0.8, 0.82, 0.86) });

  const ctx: Ctx = { doc, page, font, bold, italic, y: height - 125, width, margin };
  // Meta grid (2 columns)
  const colW = (width - margin * 2) / 2;
  meta.forEach(([k, v], i) => {
    const x = margin + (i % 2) * colW;
    const y = ctx.y - Math.floor(i / 2) * 30;
    page.drawText(ascii(k).toUpperCase(), { x, y, size: 7.5, font: bold, color: MUTED });
    page.drawText(ascii(v), { x, y: y - 12, size: 10.5, font, color: INK });
  });
  ctx.y -= Math.ceil(meta.length / 2) * 30 + 14;
  rule(ctx);
  return ctx;
}

function rule(ctx: Ctx, color = LINE) {
  ctx.page.drawLine({ start: { x: ctx.margin, y: ctx.y }, end: { x: ctx.width - ctx.margin, y: ctx.y }, thickness: 0.8, color });
  ctx.y -= 16;
}

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y - needed < 70) {
    ctx.page = ctx.doc.addPage([595.28, 841.89]);
    ctx.y = 841.89 - 60;
  }
}

function heading(ctx: Ctx, text: string) {
  ensureSpace(ctx, 40);
  ctx.page.drawText(ascii(text), { x: ctx.margin, y: ctx.y, size: 12.5, font: ctx.bold, color: INK });
  ctx.y -= 18;
}

function paragraph(ctx: Ctx, text: string, size = 10, color = INK) {
  const maxW = ctx.width - ctx.margin * 2;
  for (const para of ascii(text).split("\n")) {
    const words = para.split(" ");
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.font.widthOfTextAtSize(test, size) > maxW) {
        ensureSpace(ctx, size + 4);
        ctx.page.drawText(line, { x: ctx.margin, y: ctx.y, size, font: ctx.font, color });
        ctx.y -= size + 4;
        line = w;
      } else line = test;
    }
    ensureSpace(ctx, size + 4);
    ctx.page.drawText(line, { x: ctx.margin, y: ctx.y, size, font: ctx.font, color });
    ctx.y -= size + 6;
  }
}

type Row = { label: string; value: string; bold?: boolean; muted?: boolean };

function table(ctx: Ctx, rows: Row[], header?: [string, string]) {
  const right = ctx.width - ctx.margin;
  if (header) {
    ensureSpace(ctx, 24);
    ctx.page.drawRectangle({ x: ctx.margin, y: ctx.y - 6, width: right - ctx.margin, height: 20, color: rgb(0.96, 0.965, 0.975) });
    ctx.page.drawText(ascii(header[0]).toUpperCase(), { x: ctx.margin + 8, y: ctx.y, size: 8, font: ctx.bold, color: MUTED });
    const hw = ctx.bold.widthOfTextAtSize(ascii(header[1]).toUpperCase(), 8);
    ctx.page.drawText(ascii(header[1]).toUpperCase(), { x: right - 8 - hw, y: ctx.y, size: 8, font: ctx.bold, color: MUTED });
    ctx.y -= 22;
  }
  for (const r of rows) {
    ensureSpace(ctx, 20);
    const f = r.bold ? ctx.bold : ctx.font;
    const size = r.bold ? 11 : 10.5;
    const color = r.muted ? MUTED : INK;
    ctx.page.drawText(ascii(r.label), { x: ctx.margin + 8, y: ctx.y, size, font: f, color });
    const vw = f.widthOfTextAtSize(ascii(r.value), size);
    ctx.page.drawText(ascii(r.value), { x: right - 8 - vw, y: ctx.y, size, font: f, color });
    ctx.y -= 8;
    ctx.page.drawLine({ start: { x: ctx.margin, y: ctx.y }, end: { x: right, y: ctx.y }, thickness: r.bold ? 1 : 0.5, color: r.bold ? INK : LINE });
    ctx.y -= 13;
  }
  ctx.y -= 6;
}

function signatures(ctx: Ctx, left: string, right: string) {
  ensureSpace(ctx, 90);
  ctx.y -= 40;
  const w = 180;
  ctx.page.drawLine({ start: { x: ctx.margin, y: ctx.y }, end: { x: ctx.margin + w, y: ctx.y }, thickness: 0.8, color: INK });
  ctx.page.drawLine({ start: { x: ctx.width - ctx.margin - w, y: ctx.y }, end: { x: ctx.width - ctx.margin, y: ctx.y }, thickness: 0.8, color: INK });
  ctx.y -= 13;
  ctx.page.drawText(ascii(left), { x: ctx.margin, y: ctx.y, size: 9.5, font: ctx.font, color: MUTED });
  ctx.page.drawText(ascii(right), { x: ctx.width - ctx.margin - w, y: ctx.y, size: 9.5, font: ctx.font, color: MUTED });
  ctx.y -= 20;
}

async function finish(ctx: Ctx, footer: string) {
  const pages = ctx.doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: ctx.margin, y: 50 }, end: { x: ctx.width - ctx.margin, y: 50 }, thickness: 0.6, color: GOLD });
    p.drawText(ascii(footer), { x: ctx.margin, y: 36, size: 7.5, font: ctx.italic, color: MUTED });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: ctx.width - ctx.margin - ctx.font.widthOfTextAtSize(label, 7.5), y: 36, size: 7.5, font: ctx.font, color: MUTED });
  });
  return Buffer.from(await ctx.doc.save());
}

export type Platform = { legalName: string; gstin: string; address: string };

const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

// ───────────────────────── Documents ─────────────────────────

export type InvoiceData = {
  number: string;
  type: "BUYER_TAX_INVOICE" | "SELLER_FEE_INVOICE" | "SERVICE_INVOICE";
  issuedAt: Date;
  billToName: string;
  billToGstin: string | null;
  orderNumber?: string;
  vehicleTitle?: string;
  vehiclePrice?: number;
  lines: { description: string; amount: number; gst: number }[];
  subtotal: number;
  gst: number;
  total: number;
  platform: Platform;
};

export async function invoicePdf(d: InvoiceData) {
  const title = d.type === "SELLER_FEE_INVOICE" ? "Fee Invoice" : d.type === "SERVICE_INVOICE" ? "Tax Invoice" : "Tax Invoice";
  const ctx = await begin(title, d.number, [
    ["Invoice number", d.number],
    ["Invoice date", fmtDate(d.issuedAt)],
    ["Billed to", d.billToName],
    ["Recipient GSTIN", d.billToGstin ?? "Unregistered"],
    ["Supplier", d.platform.legalName],
    ["Supplier GSTIN", d.platform.gstin],
    ...(d.orderNumber ? ([["Order", d.orderNumber], ["Vehicle", d.vehicleTitle ?? ""]] as [string, string][]) : []),
  ]);
  heading(ctx, "Platform services (SAC 998599)");
  table(
    ctx,
    [
      ...d.lines.map((l) => ({ label: l.description, value: rs(l.amount) })),
      { label: "Taxable value", value: rs(d.subtotal), muted: true },
      { label: "GST (CGST + SGST / IGST as applicable)", value: rs(d.gst), muted: true },
      { label: "Invoice total", value: rs(d.total), bold: true },
    ],
    ["Description", "Amount"],
  );
  if (d.type === "BUYER_TAX_INVOICE" && d.vehiclePrice != null) {
    heading(ctx, "Statement of amount payable");
    table(ctx, [
      { label: "Vehicle price (payable to seller via Alpha Cars)", value: rs(d.vehiclePrice) },
      { label: "Platform fees incl. GST (this invoice)", value: rs(d.total) },
      { label: "Total payable by buyer", value: rs(d.vehiclePrice + d.total), bold: true },
    ]);
    paragraph(ctx, "The vehicle is sold by the listed dealer. Alpha Cars acts as a marketplace facilitator and collects the vehicle price on the seller's behalf. GST on the vehicle, if applicable, is the seller's responsibility under their own invoice.", 8.5, MUTED);
  }
  return finish(ctx, `${d.platform.legalName} · ${d.platform.address} · This is a computer-generated invoice.`);
}

export async function receiptPdf(d: { reference: string; paidAt: Date; payer: string; amount: number; method: string; gatewayRef: string; purpose: string; orderNumber?: string; platform: Platform }) {
  const ctx = await begin("Payment Receipt", d.reference, [
    ["Receipt reference", d.reference],
    ["Date", fmtDate(d.paidAt)],
    ["Received from", d.payer],
    ["Payment method", d.method],
    ["Gateway reference", d.gatewayRef],
    ["For", d.orderNumber ? `Order ${d.orderNumber}` : d.purpose],
  ]);
  table(ctx, [{ label: "Amount received", value: rs(d.amount), bold: true }]);
  paragraph(ctx, "Payment was verified with the payment provider before this receipt was issued.", 9, MUTED);
  return finish(ctx, `${d.platform.legalName} · Receipt generated electronically.`);
}

export type SaleData = {
  orderNumber: string;
  date: Date;
  seller: { name: string; gstin: string | null; address: string };
  buyer: { name: string; gstin: string | null };
  vehicle: { title: string; year: number; regMasked: string; vin: string | null; engine: string | null; km: number; fuel: string; color: string; owners: number };
  price: number;
  platform: Platform;
};

export async function saleAgreementPdf(d: SaleData) {
  const ctx = await begin("Sale Agreement", d.orderNumber, [
    ["Agreement date", fmtDate(d.date)],
    ["Order", d.orderNumber],
    ["Seller", d.seller.name],
    ["Buyer", d.buyer.name],
  ]);
  heading(ctx, "1. Vehicle");
  table(ctx, [
    { label: "Vehicle", value: d.vehicle.title },
    { label: "Registration", value: d.vehicle.regMasked },
    { label: "Chassis / VIN", value: d.vehicle.vin ?? "As per RC" },
    { label: "Engine number", value: d.vehicle.engine ?? "As per RC" },
    { label: "Odometer", value: `${new Intl.NumberFormat("en-IN").format(d.vehicle.km)} km` },
    { label: "Fuel / Colour / Owners", value: `${d.vehicle.fuel} / ${d.vehicle.color} / ${d.vehicle.owners}` },
  ]);
  heading(ctx, "2. Consideration");
  table(ctx, [{ label: "Agreed sale price", value: rs(d.price), bold: true }]);
  heading(ctx, "3. Terms");
  paragraph(
    ctx,
    [
      "a) The Seller confirms lawful ownership of the vehicle and authority to sell it, and that the vehicle details above match the Registration Certificate.",
      "b) The Seller shall hand over the original RC, valid insurance, service records, keys and duplicate keys, and sign Forms 29 & 30 for ownership transfer.",
      "c) Risk in the vehicle passes to the Buyer on delivery or pickup as recorded on the delivery challan.",
      "d) The Buyer shall complete the RTO ownership transfer within the period prescribed by law. Pending challans up to the date of delivery are the Seller's responsibility.",
      "e) Alpha Cars is a marketplace facilitator and not a party to this sale. Disputes are handled under the Alpha Cars Dispute Policy.",
      "This template is provided for convenience; parties should review it with their own advisors.",
    ].join("\n"),
    9.5,
  );
  signatures(ctx, `Seller: ${d.seller.name}`, `Buyer: ${d.buyer.name}`);
  return finish(ctx, `Facilitated by ${d.platform.legalName} · Order ${d.orderNumber}`);
}

export async function deliveryChallanPdf(d: SaleData & { mode: string; deliveryDate: Date | null; notes: string | null }) {
  const ctx = await begin("Delivery Challan", d.orderNumber, [
    ["Challan date", fmtDate(d.date)],
    ["Order", d.orderNumber],
    ["Consignor (Seller)", d.seller.name],
    ["Consignee (Buyer)", d.buyer.name],
    ["Mode", d.mode],
    ["Scheduled", d.deliveryDate ? fmtDate(d.deliveryDate) : "-"],
  ]);
  heading(ctx, "Vehicle handed over");
  table(ctx, [
    { label: "Vehicle", value: d.vehicle.title },
    { label: "Registration", value: d.vehicle.regMasked },
    { label: "Odometer at handover", value: `${new Intl.NumberFormat("en-IN").format(d.vehicle.km)} km` },
  ]);
  heading(ctx, "Checklist at handover");
  paragraph(ctx, "[ ] Original RC   [ ] Insurance copy   [ ] Service records   [ ] Keys (2)   [ ] Forms 29 & 30 signed   [ ] Tool kit & spare wheel", 10);
  if (d.notes) paragraph(ctx, `Notes: ${d.notes}`, 9.5, MUTED);
  signatures(ctx, "Handed over by (Seller)", "Received by (Buyer)");
  return finish(ctx, `${d.platform.legalName} · Delivery challan for order ${d.orderNumber}`);
}

export async function inspectionReportPdf(d: { vehicleTitle: string; code: string; inspectedAt: Date; inspector: string; score: number; grade: string; items: { label: string; rating: number; notes?: string }[]; summary: string; odometerVerified: boolean; platform: Platform }) {
  const ctx = await begin("Vehicle Inspection Report", d.code.toUpperCase(), [
    ["Vehicle", d.vehicleTitle],
    ["Inspected on", fmtDate(d.inspectedAt)],
    ["Inspector", d.inspector],
    ["Odometer verified", d.odometerVerified ? "Yes" : "No"],
  ]);
  // Score badge
  ensureSpace(ctx, 80);
  ctx.page.drawCircle({ x: ctx.margin + 34, y: ctx.y - 22, size: 32, borderColor: ACCENT, borderWidth: 3 });
  const s = `${d.score}`;
  ctx.page.drawText(s, { x: ctx.margin + 34 - ctx.bold.widthOfTextAtSize(s, 22) / 2, y: ctx.y - 26, size: 22, font: ctx.bold, color: INK });
  ctx.page.drawText("/100", { x: ctx.margin + 25, y: ctx.y - 40, size: 8, font: ctx.font, color: MUTED });
  ctx.page.drawText(ascii(d.grade), { x: ctx.margin + 84, y: ctx.y - 18, size: 16, font: ctx.bold, color: INK });
  ctx.page.drawText("Overall condition score", { x: ctx.margin + 84, y: ctx.y - 34, size: 9.5, font: ctx.font, color: MUTED });
  ctx.y -= 72;
  heading(ctx, "Checklist");
  table(ctx, d.items.map((i) => ({ label: i.notes ? `${i.label} - ${i.notes}` : i.label, value: `${i.rating}/10` })), ["Area", "Rating"]);
  heading(ctx, "Inspector's summary");
  paragraph(ctx, d.summary || "-", 10);
  paragraph(ctx, "This report reflects the vehicle's condition at the time of inspection based on a visual and functional check. It is not a warranty.", 8.5, MUTED);
  return finish(ctx, `${d.platform.legalName} · Inspection ${d.code.toUpperCase()}`);
}
