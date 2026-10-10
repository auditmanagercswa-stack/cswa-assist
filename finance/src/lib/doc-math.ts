/** Pure invoice / bill arithmetic shared by the server (posting) and the browser (live preview). */
import { findTds } from "@/config/tax";
import { gstSplit, isInterState, roundToRupee } from "./accounting/core";

export interface InvoiceItemInput { description: string; hsn?: string | null; qty: number; unit?: string; ratePaise: number; gstRate: number }

/** Compute an invoice without saving — used for the live preview and by createInvoice. */
export function computeInvoice(supplierState: string, posState: string, items: InvoiceItemInput[]) {
  const inter = isInterState(supplierState, posState);
  const lines = items.map((it) => {
    const taxable = Math.round(it.qty * it.ratePaise);
    return { ...it, ...gstSplit(taxable, it.gstRate, inter) };
  });
  const taxable = lines.reduce((t, l) => t + l.taxable, 0);
  const cgst = lines.reduce((t, l) => t + l.cgst, 0), sgst = lines.reduce((t, l) => t + l.sgst, 0), igst = lines.reduce((t, l) => t + l.igst, 0);
  const { rounded, roundOff } = roundToRupee(taxable + cgst + sgst + igst);
  return { interState: inter, lines, taxable, cgst, sgst, igst, roundOff, total: rounded };
}

export interface BillMathInput { taxablePaise: number; gstRate: number; reverseCharge?: boolean; tdsSection?: string | null }

/** TDS suggestion for a vendor bill: the vendor's default section, if the bill crosses its threshold. */
export function suggestTds(section: string | null | undefined, taxablePaise: number) {
  const s = findTds(section);
  if (!s) return null;
  return { section: s.section, rate: s.rate, amountPaise: Math.round((taxablePaise * s.rate) / 100), belowThreshold: taxablePaise < s.thresholdRupees * 100, label: s.label };
}

export function computeBill(companyState: string, vendorState: string | null | undefined, b: BillMathInput) {
  const inter = isInterState(companyState, vendorState);
  const g = gstSplit(b.taxablePaise, b.gstRate, inter);
  const tdsDef = findTds(b.tdsSection);
  const tds = tdsDef ? Math.round((b.taxablePaise * tdsDef.rate) / 100) : 0;
  // Under reverse charge the vendor doesn't charge GST; we self-assess it (Dr input, Cr RCM payable).
  const total = b.reverseCharge ? b.taxablePaise : g.total;
  return { ...g, interState: inter, tds, tdsRate: tdsDef?.rate ?? null, total, payable: total - tds };
}

