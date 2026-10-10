import "server-only";
import QRCode from "qrcode";
import { db, n } from "@/lib/db";
import { upiLink } from "@/lib/queries";
import { rupeesInWords } from "@/lib/words";
import type { InvoicePdfData } from "@/lib/pdf/invoice-pdf";

/** Everything an invoice view/PDF needs. `companyId` scopes the lookup. */
export async function invoiceData(companyId: string, id: string) {
  const inv = await db.invoice.findFirst({ where: { id, companyId }, include: { party: true, items: true, company: true, allocations: { include: { voucher: true } } } });
  if (!inv) return null;
  const outstanding = n(inv.totalPaise) - n(inv.paidPaise);
  const upi = inv.company.upiId && outstanding > 0 ? upiLink(inv.company.upiId, inv.company.name, outstanding, `Invoice ${inv.number}`) : null;
  const qrDataUrl = upi ? await QRCode.toDataURL(upi, { margin: 1, width: 240, color: { dark: "#0F2A22", light: "#FFFFFF" } }) : null;
  const pdf: InvoicePdfData = {
    company: { name: inv.company.name, gstin: inv.company.gstin, pan: inv.company.pan, address: inv.company.address, email: inv.company.email, phone: inv.company.phone, stateCode: inv.company.stateCode, upiId: inv.company.upiId },
    party: { name: inv.party.name, gstin: inv.party.gstin, address: inv.party.address, stateCode: inv.party.stateCode },
    invoice: { number: inv.number, date: inv.date, dueDate: inv.dueDate, placeOfSupply: inv.placeOfSupply, interState: inv.interState, taxable: n(inv.taxablePaise), cgst: n(inv.cgstPaise), sgst: n(inv.sgstPaise), igst: n(inv.igstPaise), roundOff: n(inv.roundOffPaise), total: n(inv.totalPaise), paid: n(inv.paidPaise), notes: inv.notes, irn: inv.irn },
    items: inv.items.map((i) => ({ description: i.description, hsn: i.hsn, qty: i.qty, unit: i.unit, rate: n(i.ratePaise), gstRate: i.gstRate, taxable: n(i.taxablePaise) })),
    qrDataUrl, amountInWords: rupeesInWords(n(inv.totalPaise)),
  };
  return { inv, pdf, outstanding, upi };
}
