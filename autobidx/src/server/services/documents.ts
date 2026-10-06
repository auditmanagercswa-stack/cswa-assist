import { prisma } from "@/lib/db";
import { AppError, conflict, forbidden, notFound } from "@/lib/errors";
import { humanize, maskRegistration } from "@/lib/format";
import type { DocumentType } from "@prisma/client";
import type { Actor } from "../auth/rbac";
import { can } from "../auth/rbac";
import { audit } from "../audit";
import { notify, notifyDealer } from "../notifications/notify";
import { getSettings } from "../settings";
import { storage } from "../storage";
import { orderRoleFor } from "./orders";
import { scoreGrade } from "./inspections";
import { deliveryChallanPdf, inspectionReportPdf, invoicePdf, receiptPdf, saleAgreementPdf, type Platform } from "../pdf/documents";

export async function platformInfo(): Promise<Platform> {
  const s = await getSettings(["gst.platformLegalName", "gst.platformGstin", "gst.platformAddress"]);
  return { legalName: s["gst.platformLegalName"], gstin: s["gst.platformGstin"], address: s["gst.platformAddress"] };
}

type FileOut = { data: Buffer; mime: string; filename: string };

/** Renders (generated) or streams (uploaded) an order document after an access check. */
export async function getOrderDocument(documentId: string, actor: Actor): Promise<FileOut> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      file: true,
      order: {
        include: {
          vehicle: true,
          buyer: true,
          buyerDealer: true,
          sellerDealer: { include: { district: true, state: true } },
          invoices: true,
          payments: { where: { status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } }, orderBy: { verifiedAt: "desc" } },
        },
      },
    },
  });
  if (!doc) throw notFound("Document not found.");
  const role = orderRoleFor(actor, doc.order);
  if (!role) throw notFound("Document not found.");
  const o = doc.order;
  const platform = await platformInfo();
  await audit({ userId: actor.userId, action: "document.download", entityType: "Document", entityId: doc.id, after: { type: doc.type } });

  if (!doc.generated) {
    if (!doc.file) throw notFound();
    const data = await storage.get(doc.file.key);
    if (!data) throw notFound("File is missing.");
    return { data, mime: doc.file.mime, filename: `${doc.type.toLowerCase()}-${o.orderNumber}.${doc.file.mime === "application/pdf" ? "pdf" : "webp"}` };
  }

  const sale = {
    orderNumber: o.orderNumber,
    date: o.createdAt,
    seller: { name: o.sellerDealer.name, gstin: o.sellerDealer.gstin, address: `${o.sellerDealer.addressLine}, ${o.sellerDealer.district.name}, ${o.sellerDealer.state.name} ${o.sellerDealer.pincode}` },
    buyer: { name: o.buyerDealer?.name ?? o.buyer.name, gstin: o.buyerDealer?.gstin ?? null },
    vehicle: {
      title: o.vehicle.title,
      year: o.vehicle.year,
      regMasked: role === "admin" || o.paymentStatus === "PAID" ? (o.vehicle.registrationNumber ?? "As per RC") : maskRegistration(o.vehicle.registrationNumber),
      vin: o.paymentStatus === "PAID" || role !== "buyer" ? o.vehicle.vin : null,
      engine: o.paymentStatus === "PAID" || role !== "buyer" ? o.vehicle.engineNumber : null,
      km: o.vehicle.kmDriven,
      fuel: humanize(o.vehicle.fuel),
      color: o.vehicle.color,
      owners: o.vehicle.owners,
    },
    price: o.vehiclePrice,
    platform,
  };

  let data: Buffer;
  switch (doc.type as DocumentType) {
    case "INVOICE": {
      // Buyer sees the buyer invoice, seller sees their fee invoice, admin sees buyer invoice.
      const inv = o.invoices.find((i) => i.type === (role === "seller" ? "SELLER_FEE_INVOICE" : "BUYER_TAX_INVOICE"));
      if (!inv) throw notFound("Invoice not found.");
      data = await invoicePdf({
        number: inv.number,
        type: inv.type,
        issuedAt: inv.issuedAt,
        billToName: inv.billToName,
        billToGstin: inv.billToGstin,
        orderNumber: o.orderNumber,
        vehicleTitle: o.vehicle.title,
        vehiclePrice: inv.type === "BUYER_TAX_INVOICE" ? o.vehiclePrice : undefined,
        lines: inv.lines as { description: string; amount: number; gst: number }[],
        subtotal: inv.subtotal,
        gst: inv.gst,
        total: inv.total,
        platform,
      });
      break;
    }
    case "PAYMENT_RECEIPT": {
      const p = o.payments[0];
      if (!p) throw conflict("No verified payment yet.");
      data = await receiptPdf({ reference: p.reference, paidAt: p.verifiedAt ?? p.updatedAt, payer: sale.buyer.name, amount: p.amount, method: humanize(p.method ?? "ONLINE"), gatewayRef: p.gatewayPaymentId ?? "-", purpose: "Vehicle purchase", orderNumber: o.orderNumber, platform });
      break;
    }
    case "SALE_AGREEMENT":
      data = await saleAgreementPdf(sale);
      break;
    case "DELIVERY_CHALLAN":
      data = await deliveryChallanPdf({ ...sale, date: new Date(), mode: humanize(o.deliveryMode ?? "PICKUP"), deliveryDate: o.deliveryDate, notes: o.deliveryNotes });
      break;
    case "INSPECTION_REPORT": {
      const ins = await prisma.vehicleInspection.findFirst({ where: { vehicleId: o.vehicleId, status: "COMPLETED" }, orderBy: { inspectedAt: "desc" } });
      if (!ins) throw notFound("No inspection report.");
      data = await inspectionReportPdfFor(ins.id);
      break;
    }
    default:
      throw notFound();
  }
  return { data, mime: "application/pdf", filename: `${doc.type.toLowerCase().replace(/_/g, "-")}-${o.orderNumber}.pdf` };
}

export async function inspectionReportPdfFor(inspectionId: string) {
  const ins = await prisma.vehicleInspection.findUnique({ where: { id: inspectionId }, include: { vehicle: true } });
  if (!ins || ins.status !== "COMPLETED" || ins.score == null) throw notFound("Inspection report not available.");
  return inspectionReportPdf({
    vehicleTitle: ins.vehicle.title,
    code: ins.vehicle.code,
    inspectedAt: ins.inspectedAt ?? ins.updatedAt,
    inspector: ins.inspectorName ?? "Alpha Cars Inspection Partner",
    score: ins.score,
    grade: scoreGrade(ins.score),
    items: (ins.checklist as { label: string; rating: number; notes?: string }[]) ?? [],
    summary: ins.summary ?? "",
    odometerVerified: !!ins.odometerVerified,
    platform: await platformInfo(),
  });
}

/** Service invoice (listing / featured / subscription) for the paying dealer. */
export async function getInvoicePdf(invoiceId: string, actor: Actor): Promise<FileOut> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { order: { include: { vehicle: true } } } });
  if (!inv) throw notFound();
  const allowed = can(actor, "payments.manage") || (actor.dealer && inv.dealerId === actor.dealer.id) || (inv.order && orderRoleFor(actor, inv.order));
  if (!allowed) throw notFound();
  const data = await invoicePdf({
    number: inv.number,
    type: inv.type,
    issuedAt: inv.issuedAt,
    billToName: inv.billToName,
    billToGstin: inv.billToGstin,
    orderNumber: inv.order?.orderNumber,
    vehicleTitle: inv.order?.vehicle.title,
    vehiclePrice: inv.type === "BUYER_TAX_INVOICE" ? inv.order?.vehiclePrice : undefined,
    lines: inv.lines as { description: string; amount: number; gst: number }[],
    subtotal: inv.subtotal,
    gst: inv.gst,
    total: inv.total,
    platform: await platformInfo(),
  });
  return { data, mime: "application/pdf", filename: `${inv.number.replace(/\//g, "-")}.pdf` };
}

const UPLOADABLE: DocumentType[] = ["RC", "INSURANCE", "OTHER", "SALE_AGREEMENT", "DELIVERY_CHALLAN"];

export async function uploadOrderDocument(actor: Actor, orderId: string, input: { type: DocumentType; fileId: string; title?: string }) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound();
  const role = orderRoleFor(actor, order);
  if (role !== "seller" && role !== "admin" && !(role === "buyer" && input.type === "OTHER")) throw forbidden();
  if (!UPLOADABLE.includes(input.type)) throw new AppError("VALIDATION", "This document type can't be uploaded.");
  if (["CANCELLED"].includes(order.status)) throw conflict("This order is cancelled.");
  const file = await prisma.storedFile.findUnique({ where: { id: input.fileId } });
  if (!file || file.ownerId !== actor.userId) throw new AppError("VALIDATION", "Upload the file again.");
  const doc = await prisma.$transaction(async (tx) => {
    const d = await tx.document.create({ data: { orderId, type: input.type, generated: false, fileId: file.id, uploadedById: actor.userId, title: input.title || humanize(input.type) } });
    await audit({ userId: actor.userId, action: "document.upload", entityType: "Order", entityId: orderId, after: { type: input.type } }, tx);
    const msg = { type: "DOCUMENTS" as const, title: "New document uploaded", body: `${humanize(input.type)} added to order ${order.orderNumber}.`, link: `/dashboard/orders/${orderId}` };
    if (role === "seller") await notify(order.buyerId, msg, tx);
    else await notifyDealer(order.sellerDealerId, msg, tx);
    return d;
  });
  return doc;
}

/** Authorised streaming of a private stored file (KYC, vehicle documents). */
export async function getPrivateFile(fileId: string, actor: Actor): Promise<FileOut> {
  const f = await prisma.storedFile.findUnique({
    where: { id: fileId },
    include: {
      kycDocuments: { include: { kyc: { select: { dealerId: true } } } },
      vehicleDocuments: { include: { vehicle: { select: { dealerId: true, id: true } } } },
      orderDocuments: { include: { order: true } },
    },
  });
  if (!f) throw notFound();
  let allowed = f.ownerId === actor.userId || f.visibility === "PUBLIC";
  if (!allowed && can(actor, "dealers.view")) allowed = true;
  if (!allowed && actor.dealer) {
    allowed =
      f.kycDocuments.some((k) => k.kyc.dealerId === actor.dealer!.id) ||
      f.vehicleDocuments.some((v) => v.vehicle.dealerId === actor.dealer!.id);
  }
  if (!allowed) {
    // Buyers of a vehicle may access its documents after purchase.
    for (const od of f.orderDocuments) if (orderRoleFor(actor, od.order)) allowed = true;
    if (!allowed && f.vehicleDocuments.length) {
      const bought = await prisma.order.findFirst({ where: { vehicleId: f.vehicleDocuments[0].vehicle.id, buyerId: actor.userId, paymentStatus: "PAID" } });
      allowed = !!bought;
    }
  }
  if (!allowed) throw notFound();
  const data = await storage.get(f.key);
  if (!data) throw notFound();
  return { data, mime: f.mime, filename: f.originalName ?? f.key.split("/").pop()! };
}
