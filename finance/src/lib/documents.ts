/**
 * Sales invoices, purchase bills, receipts, payments and parties.
 * Each document posts a balanced voucher through accounting/post.ts — no ledger is ever written directly.
 */
import { Prisma, type PartyKind } from "@prisma/client";
import { db, n } from "@/lib/db";
import { fyStartYear } from "@/lib/fy";
import type { Ctx } from "@/lib/session";
import { assertCanWrite } from "@/lib/roles";
import { findTds } from "@/config/tax";
import { gstSplit, isInterState, roundToRupee, validateGstin, validatePan, stateOfGstin, type Line } from "./accounting/core";
import { AccountingError, createAndPost, nextNumber } from "./accounting/post";

type Tx = Prisma.TransactionClient;

async function ledgerByHead(t: Tx, companyId: string, head: string) {
  const l = await t.ledger.findFirst({ where: { companyId, taxHead: head } });
  if (!l) throw new AccountingError(`Ledger for ${head} is missing from the chart of accounts.`);
  return l.id;
}
async function ledgerByKind(t: Tx, companyId: string, kind: "ROUND_OFF") {
  const l = await t.ledger.findFirst({ where: { companyId, kind } });
  if (!l) throw new AccountingError("Round-off ledger missing.");
  return l.id;
}
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);

// ───────────── Parties ─────────────

export interface PartyInput { name: string; kind: PartyKind; gstin?: string | null; pan?: string | null; stateCode?: string | null; email?: string | null; phone?: string | null; address?: string | null; creditDays?: number; tdsSection?: string | null; openingPaise?: number }

export function checkPartyIds(p: Pick<PartyInput, "gstin" | "pan">) {
  if (p.gstin) { const v = validateGstin(p.gstin); if (!v.ok) throw new AccountingError(`GSTIN: ${v.reason}`); }
  if (p.pan && !validatePan(p.pan)) throw new AccountingError("PAN should look like ABCDE1234F.");
}

export async function createParty(ctx: Ctx, p: PartyInput, tx?: Tx) {
  assertCanWrite(ctx);
  checkPartyIds(p);
  const run = async (t: Tx) => {
    const groupName = p.kind === "VENDOR" ? "Sundry Creditors" : "Sundry Debtors";
    const group = await t.ledgerGroup.findFirstOrThrow({ where: { companyId: ctx.company.id, name: groupName } });
    const gstin = p.gstin?.toUpperCase() || null;
    const ledger = await t.ledger.create({ data: { companyId: ctx.company.id, groupId: group.id, name: p.name.trim(), kind: "PARTY", openingPaise: BigInt(p.openingPaise ?? 0), aliases: [p.name.toLowerCase()] } });
    return t.party.create({
      data: {
        companyId: ctx.company.id, ledgerId: ledger.id, name: p.name.trim(), kind: p.kind, gstin, pan: p.pan?.toUpperCase() || (gstin ? gstin.slice(2, 12) : null),
        stateCode: p.stateCode || (gstin ? stateOfGstin(gstin) : null), email: p.email || null, phone: p.phone || null, address: p.address || null,
        creditDays: p.creditDays ?? 30, tdsSection: p.tdsSection || null,
      },
    });
  };
  return tx ? run(tx) : db.$transaction(run);
}

// ───────────── Sales invoices ─────────────

export interface InvoiceItemInput { description: string; hsn?: string | null; qty: number; unit?: string; ratePaise: number; gstRate: number }
export interface InvoiceInput { partyId: string; date: Date; dueDate?: Date; placeOfSupply?: string; items: InvoiceItemInput[]; notes?: string | null }

/** Compute an invoice without saving — used for the live preview and by createInvoice. */
export function computeInvoice(supplierState: string, posState: string, items: InvoiceItemInput[]) {
  const inter = isInterState(supplierState, posState);
  const lines = items.map((it) => {
    const taxable = Math.round(it.qty * it.ratePaise);
    return { ...it, taxable, ...gstSplit(taxable, it.gstRate, inter) };
  });
  const taxable = lines.reduce((t, l) => t + l.taxable, 0);
  const cgst = lines.reduce((t, l) => t + l.cgst, 0), sgst = lines.reduce((t, l) => t + l.sgst, 0), igst = lines.reduce((t, l) => t + l.igst, 0);
  const { rounded, roundOff } = roundToRupee(taxable + cgst + sgst + igst);
  return { interState: inter, lines, taxable, cgst, sgst, igst, roundOff, total: rounded };
}

export async function createInvoice(ctx: Ctx, input: InvoiceInput, tx?: Tx) {
  assertCanWrite(ctx);
  if (!input.items.length) throw new AccountingError("Add at least one item.");
  const run = async (t: Tx) => {
    const party = await t.party.findFirst({ where: { id: input.partyId, companyId: ctx.company.id } });
    if (!party) throw new AccountingError("Customer not found.");
    const pos = input.placeOfSupply || party.stateCode || ctx.company.stateCode;
    const c = computeInvoice(ctx.company.stateCode, pos, input.items);
    const sales = await t.ledger.findFirstOrThrow({ where: { companyId: ctx.company.id, name: "Sales" } });
    const lines: (Line & { gst?: Prisma.InputJsonValue })[] = [
      { ledgerId: party.ledgerId, side: "DR", amountPaise: c.total },
      { ledgerId: sales.id, side: "CR", amountPaise: c.taxable, gst: { taxable: c.taxable } },
    ];
    if (c.cgst) lines.push({ ledgerId: await ledgerByHead(t, ctx.company.id, "CGST_OUT"), side: "CR", amountPaise: c.cgst });
    if (c.sgst) lines.push({ ledgerId: await ledgerByHead(t, ctx.company.id, "SGST_OUT"), side: "CR", amountPaise: c.sgst });
    if (c.igst) lines.push({ ledgerId: await ledgerByHead(t, ctx.company.id, "IGST_OUT"), side: "CR", amountPaise: c.igst });
    if (c.roundOff) lines.push({ ledgerId: await ledgerByKind(t, ctx.company.id, "ROUND_OFF"), side: c.roundOff > 0 ? "CR" : "DR", amountPaise: Math.abs(c.roundOff) });
    const fy = fyStartYear(input.date);
    const number = await nextNumber(t, ctx.company.id, fy, "INVOICE");
    const v = await createAndPost(ctx, { type: "SALES", date: input.date, partyId: party.id, source: "INVOICE", narration: `Sales invoice ${number}`, lines }, t);
    const inv = await t.invoice.create({
      data: {
        companyId: ctx.company.id, partyId: party.id, voucherId: v.id, number, fy, date: input.date, dueDate: input.dueDate ?? addDays(input.date, party.creditDays),
        placeOfSupply: pos, interState: c.interState, taxablePaise: BigInt(c.taxable), cgstPaise: BigInt(c.cgst), sgstPaise: BigInt(c.sgst), igstPaise: BigInt(c.igst),
        roundOffPaise: BigInt(c.roundOff), totalPaise: BigInt(c.total), notes: input.notes ?? null,
        items: { create: c.lines.map((l) => ({ description: l.description, hsn: l.hsn ?? null, qty: l.qty, unit: l.unit ?? "Nos", ratePaise: BigInt(l.ratePaise), gstRate: l.gstRate, taxablePaise: BigInt(l.taxable) })) },
      },
    });
    return inv;
  };
  return tx ? run(tx) : db.$transaction(run);
}

/** Customer payment against an invoice (or on account). Optional TDS deducted by the customer. */
export async function recordReceipt(ctx: Ctx, r: { partyId: string; amountPaise: number; date: Date; bankLedgerId: string; invoiceId?: string | null; tdsPaise?: number; narration?: string }, tx?: Tx) {
  assertCanWrite(ctx);
  const run = async (t: Tx) => {
    const party = await t.party.findFirst({ where: { id: r.partyId, companyId: ctx.company.id } });
    if (!party) throw new AccountingError("Customer not found.");
    const tds = r.tdsPaise ?? 0;
    const lines: Line[] = [{ ledgerId: r.bankLedgerId, side: "DR", amountPaise: r.amountPaise }, { ledgerId: party.ledgerId, side: "CR", amountPaise: r.amountPaise + tds }];
    if (tds) lines.splice(1, 0, { ledgerId: await ledgerByHead(t, ctx.company.id, "TDS_RECEIVABLE"), side: "DR", amountPaise: tds });
    const v = await createAndPost(ctx, { type: "RECEIPT", date: r.date, partyId: party.id, source: "MANUAL", narration: r.narration ?? `Received from ${party.name}`, lines }, t);
    if (r.invoiceId) await allocate(t, ctx.company.id, v.id, { invoiceId: r.invoiceId }, r.amountPaise + tds);
    return v;
  };
  return tx ? run(tx) : db.$transaction(run);
}

async function allocate(t: Tx, companyId: string, voucherId: string, target: { invoiceId?: string; billId?: string }, amount: number) {
  if (target.invoiceId) {
    const inv = await t.invoice.findFirstOrThrow({ where: { id: target.invoiceId, companyId } });
    const paid = n(inv.paidPaise) + amount;
    await t.invoice.update({ where: { id: inv.id }, data: { paidPaise: BigInt(paid), status: paid >= n(inv.totalPaise) ? "PAID" : "PARTIAL" } });
  }
  if (target.billId) {
    const b = await t.bill.findFirstOrThrow({ where: { id: target.billId, companyId } });
    const paid = n(b.paidPaise) + amount;
    await t.bill.update({ where: { id: b.id }, data: { paidPaise: BigInt(paid), status: paid >= n(b.payablePaise) ? "PAID" : "PARTIAL", scheduledOn: null } });
  }
  await t.allocation.create({ data: { voucherId, invoiceId: target.invoiceId ?? null, billId: target.billId ?? null, amountPaise: BigInt(amount) } });
}

// ───────────── Purchase bills ─────────────

export interface BillInput {
  partyId: string; vendorBillNo: string; date: Date; dueDate?: Date; expenseLedgerId: string; description?: string | null; hsn?: string | null;
  taxablePaise: number; gstRate: number; reverseCharge?: boolean; tdsSection?: string | null; attachmentName?: string | null;
}

/** TDS suggestion for a vendor bill: the vendor's default section, if the bill crosses its threshold. */
export function suggestTds(section: string | null | undefined, taxablePaise: number) {
  const s = findTds(section);
  if (!s) return null;
  return { section: s.section, rate: s.rate, amountPaise: Math.round((taxablePaise * s.rate) / 100), belowThreshold: taxablePaise < s.thresholdRupees * 100, label: s.label };
}

export function computeBill(companyState: string, vendorState: string | null | undefined, b: Pick<BillInput, "taxablePaise" | "gstRate" | "reverseCharge" | "tdsSection">) {
  const inter = isInterState(companyState, vendorState);
  const g = gstSplit(b.taxablePaise, b.gstRate, inter);
  const tdsDef = findTds(b.tdsSection);
  const tds = tdsDef ? Math.round((b.taxablePaise * tdsDef.rate) / 100) : 0;
  // Under reverse charge the vendor doesn't charge GST; we self-assess it (Dr input, Cr RCM payable).
  const total = b.reverseCharge ? b.taxablePaise : g.total;
  return { ...g, interState: inter, tds, tdsRate: tdsDef?.rate ?? null, total, payable: total - tds };
}

export async function createBill(ctx: Ctx, b: BillInput, tx?: Tx) {
  assertCanWrite(ctx);
  const run = async (t: Tx) => {
    const party = await t.party.findFirst({ where: { id: b.partyId, companyId: ctx.company.id } });
    if (!party) throw new AccountingError("Vendor not found.");
    const exp = await t.ledger.findFirst({ where: { id: b.expenseLedgerId, companyId: ctx.company.id } });
    if (!exp) throw new AccountingError("Expense ledger not found.");
    const c = computeBill(ctx.company.stateCode, party.stateCode, b);
    const lines: (Line & { gst?: Prisma.InputJsonValue })[] = [{ ledgerId: exp.id, side: "DR", amountPaise: b.taxablePaise, gst: { taxable: b.taxablePaise, rate: b.gstRate, hsn: b.hsn ?? null } }];
    const cid = ctx.company.id;
    if (c.cgst) lines.push({ ledgerId: await ledgerByHead(t, cid, "CGST_IN"), side: "DR", amountPaise: c.cgst });
    if (c.sgst) lines.push({ ledgerId: await ledgerByHead(t, cid, "SGST_IN"), side: "DR", amountPaise: c.sgst });
    if (c.igst) lines.push({ ledgerId: await ledgerByHead(t, cid, "IGST_IN"), side: "DR", amountPaise: c.igst });
    if (b.reverseCharge && c.tax) lines.push({ ledgerId: await ledgerByHead(t, cid, "RCM_PAYABLE"), side: "CR", amountPaise: c.tax });
    lines.push({ ledgerId: party.ledgerId, side: "CR", amountPaise: c.payable });
    if (c.tds) lines.push({ ledgerId: await ledgerByHead(t, cid, "TDS_PAYABLE"), side: "CR", amountPaise: c.tds });
    const tdsMeta = c.tds ? { section: b.tdsSection, rate: c.tdsRate, amountPaise: c.tds, basePaise: b.taxablePaise } : null;
    const v = await createAndPost(ctx, { type: "PURCHASE", date: b.date, partyId: party.id, source: "BILL", reverseCharge: !!b.reverseCharge, tds: tdsMeta ?? undefined, narration: `${party.name} bill ${b.vendorBillNo}${b.description ? ` — ${b.description}` : ""}`, lines }, t);
    return t.bill.create({
      data: {
        companyId: cid, partyId: party.id, voucherId: v.id, vendorBillNo: b.vendorBillNo, date: b.date, dueDate: b.dueDate ?? addDays(b.date, party.creditDays),
        expenseLedgerId: exp.id, description: b.description ?? null, hsn: b.hsn ?? null, interState: c.interState, gstRate: b.gstRate,
        taxablePaise: BigInt(b.taxablePaise), cgstPaise: BigInt(c.cgst), sgstPaise: BigInt(c.sgst), igstPaise: BigInt(c.igst), reverseCharge: !!b.reverseCharge,
        tdsSection: c.tds ? b.tdsSection : null, tdsRate: c.tdsRate, tdsPaise: BigInt(c.tds), totalPaise: BigInt(c.total), payablePaise: BigInt(c.payable), attachmentName: b.attachmentName ?? null,
      },
    });
  };
  return tx ? run(tx) : db.$transaction(run);
}

export async function payBill(ctx: Ctx, p: { billId: string; amountPaise: number; date: Date; bankLedgerId: string }, tx?: Tx) {
  assertCanWrite(ctx);
  const run = async (t: Tx) => {
    const bill = await t.bill.findFirst({ where: { id: p.billId, companyId: ctx.company.id }, include: { party: true } });
    if (!bill) throw new AccountingError("Bill not found.");
    const outstanding = n(bill.payablePaise) - n(bill.paidPaise);
    if (p.amountPaise > outstanding) throw new AccountingError("Payment is more than the amount outstanding on this bill.");
    const v = await createAndPost(ctx, {
      type: "PAYMENT", date: p.date, partyId: bill.partyId, source: "MANUAL", narration: `Paid ${bill.party.name} against bill ${bill.vendorBillNo}`,
      lines: [{ ledgerId: bill.party.ledgerId, side: "DR", amountPaise: p.amountPaise }, { ledgerId: p.bankLedgerId, side: "CR", amountPaise: p.amountPaise }],
    }, t);
    await allocate(t, ctx.company.id, v.id, { billId: bill.id }, p.amountPaise);
    return v;
  };
  return tx ? run(tx) : db.$transaction(run);
}
