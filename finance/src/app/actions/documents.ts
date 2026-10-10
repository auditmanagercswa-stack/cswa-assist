"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, n } from "@/lib/db";
import { getCtx } from "@/lib/session";
import { assertCanWrite } from "@/lib/roles";
import { rateLimit } from "@/lib/rate-limit";
import { AccountingError, createDraft, reverseVoucher, writeAudit } from "@/lib/accounting/post";
import { createBill, createInvoice, createParty, payBill, recordReceipt, checkPartyIds } from "@/lib/documents";
import { aiEnabled } from "@/lib/ai/client";
import { extractBill } from "@/lib/ai/bill-ocr";
import { stateOfGstin } from "@/lib/accounting/core";
import { attempt } from "./result";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((s) => new Date(s + "T00:00:00Z"));
const paise = z.number().int().positive();

// ───────────── Invoices ─────────────

const InvoiceIn = z.object({
  partyId: z.string().min(1, "Choose a customer"), date: day, dueDate: day.optional(), placeOfSupply: z.string().length(2), notes: z.string().max(500).optional(),
  items: z.array(z.object({ description: z.string().min(1, "Describe each item"), hsn: z.string().max(10).optional(), qty: z.number().positive(), unit: z.string().max(10), ratePaise: paise, gstRate: z.number().min(0).max(40) })).min(1),
});
export async function createInvoiceAction(input: z.input<typeof InvoiceIn>) {
  return attempt(async () => {
    const ctx = await getCtx();
    const parsed = InvoiceIn.safeParse(input);
    if (!parsed.success) throw new AccountingError(parsed.error.issues[0].message);
    const inv = await createInvoice(ctx, parsed.data);
    revalidatePath("/", "layout");
    return { id: inv.id, number: inv.number };
  });
}

const ReceiptIn = z.object({ invoiceId: z.string(), amountPaise: paise, date: day, bankLedgerId: z.string(), tdsPaise: z.number().int().min(0).default(0) });
export async function recordReceiptAction(input: z.input<typeof ReceiptIn>) {
  return attempt(async () => {
    const ctx = await getCtx();
    const r = ReceiptIn.parse(input);
    const inv = await db.invoice.findFirst({ where: { id: r.invoiceId, companyId: ctx.company.id } });
    if (!inv) throw new AccountingError("Invoice not found.");
    if (r.amountPaise + r.tdsPaise > n(inv.totalPaise) - n(inv.paidPaise)) throw new AccountingError("That's more than the amount outstanding.");
    const v = await recordReceipt(ctx, { partyId: inv.partyId, invoiceId: inv.id, amountPaise: r.amountPaise, tdsPaise: r.tdsPaise, date: r.date, bankLedgerId: r.bankLedgerId });
    revalidatePath("/", "layout");
    return { number: v.number };
  });
}

export async function cancelInvoiceAction(id: string) {
  return attempt(async () => {
    const ctx = await getCtx();
    const inv = await db.invoice.findFirst({ where: { id, companyId: ctx.company.id } });
    if (!inv) throw new AccountingError("Invoice not found.");
    if (n(inv.paidPaise) > 0) throw new AccountingError("This invoice has payments against it — issue a credit note instead.");
    if (inv.status === "CANCELLED") throw new AccountingError("Already cancelled.");
    await db.$transaction(async (t) => {
      if (inv.voucherId) await reverseVoucher(ctx, inv.voucherId, `invoice ${inv.number} cancelled`, t);
      await t.invoice.update({ where: { id }, data: { status: "CANCELLED" } });
      await writeAudit(t, ctx, "invoice.cancel", "Invoice", id, { status: inv.status }, { status: "CANCELLED" });
    });
    revalidatePath("/", "layout");
    return null;
  });
}

// ───────────── Bills ─────────────

const BillIn = z.object({
  partyId: z.string().min(1, "Choose a vendor"), vendorBillNo: z.string().min(1, "Enter the vendor's bill number").max(40), date: day, dueDate: day.optional(),
  expenseLedgerId: z.string().min(1, "Choose what the bill is for"), description: z.string().max(200).optional(), hsn: z.string().max(10).optional(),
  taxablePaise: paise, gstRate: z.number().min(0).max(40), reverseCharge: z.boolean().default(false), tdsSection: z.string().nullable().optional(), attachmentName: z.string().max(120).optional(),
});
export async function createBillAction(input: z.input<typeof BillIn>) {
  return attempt(async () => {
    const ctx = await getCtx();
    const parsed = BillIn.safeParse(input);
    if (!parsed.success) throw new AccountingError(parsed.error.issues[0].message);
    try {
      const b = await createBill(ctx, parsed.data);
      revalidatePath("/", "layout");
      return { id: b.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AccountingError("This vendor bill number is already recorded.");
      throw e;
    }
  });
}

const PayIn = z.object({ billId: z.string(), amountPaise: paise, date: day, bankLedgerId: z.string() });
export async function payBillAction(input: z.input<typeof PayIn>) {
  return attempt(async () => {
    const v = await payBill(await getCtx(), PayIn.parse(input));
    revalidatePath("/", "layout");
    return { number: v.number };
  });
}

export async function scheduleBillAction(billId: string, date: string | null) {
  return attempt(async () => {
    const ctx = await getCtx();
    assertCanWrite(ctx);
    const r = await db.bill.updateMany({ where: { id: billId, companyId: ctx.company.id }, data: { scheduledOn: date ? new Date(date + "T00:00:00Z") : null } });
    if (!r.count) throw new AccountingError("Bill not found.");
    revalidatePath("/payables");
    return null;
  });
}

/** Photo of a vendor bill → fields to prefill the New bill form (nothing is saved). */
export async function readBillAction(form: FormData) {
  return attempt(async () => {
    const ctx = await getCtx();
    assertCanWrite(ctx);
    if (!aiEnabled()) throw new AccountingError("Reading bills needs ANTHROPIC_API_KEY. You can still type the bill in.");
    const rl = rateLimit(`ai:${ctx.user.id}`, 20, 60_000);
    if (!rl.ok) throw new AccountingError(`Try again in ${rl.retryInSec}s.`);
    const f = form.get("file");
    if (!(f instanceof File) || !f.size) throw new AccountingError("Choose a photo of the bill.");
    if (f.size > 5 * 1024 * 1024) throw new AccountingError("Image is over 5 MB.");
    const mt = (["image/jpeg", "image/png", "image/webp", "image/gif"] as const).find((t) => t === f.type);
    if (!mt) throw new AccountingError("Use a JPG, PNG, WebP or GIF image.");
    const fields = await extractBill({ data: Buffer.from(await f.arrayBuffer()).toString("base64"), mediaType: mt });
    const vendor = fields.vendorGstin ? await db.party.findFirst({ where: { companyId: ctx.company.id, gstin: fields.vendorGstin.toUpperCase() } }) : null;
    return { ...fields, vendorId: vendor?.id ?? null, fileName: f.name };
  });
}

// ───────────── Parties ─────────────

const PartyIn = z.object({
  name: z.string().trim().min(2, "Enter the party's name").max(80), kind: z.enum(["CUSTOMER", "VENDOR", "BOTH"]),
  gstin: z.string().trim().toUpperCase().max(15).optional().or(z.literal("")), pan: z.string().trim().toUpperCase().max(10).optional().or(z.literal("")),
  stateCode: z.string().length(2).optional().or(z.literal("")), email: z.string().email("Check the email").optional().or(z.literal("")), phone: z.string().max(20).optional(),
  address: z.string().max(300).optional(), creditDays: z.number().int().min(0).max(365).default(30), tdsSection: z.string().optional().or(z.literal("")),
});
export async function createPartyAction(input: z.input<typeof PartyIn>) {
  return attempt(async () => {
    const ctx = await getCtx();
    const parsed = PartyIn.safeParse(input);
    if (!parsed.success) throw new AccountingError(parsed.error.issues[0].message);
    const p = parsed.data;
    try {
      const party = await createParty(ctx, { ...p, gstin: p.gstin || null, pan: p.pan || null, stateCode: p.stateCode || (p.gstin ? stateOfGstin(p.gstin) : ctx.company.stateCode), email: p.email || null, tdsSection: p.tdsSection || null });
      revalidatePath("/parties");
      return { id: party.id, name: party.name, stateCode: party.stateCode, creditDays: party.creditDays, tdsSection: party.tdsSection };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AccountingError("A party or ledger with this name already exists.");
      throw e;
    }
  });
}

export async function updatePartyAction(id: string, input: z.input<typeof PartyIn>) {
  return attempt(async () => {
    const ctx = await getCtx();
    assertCanWrite(ctx);
    const parsed = PartyIn.safeParse(input);
    if (!parsed.success) throw new AccountingError(parsed.error.issues[0].message);
    const p = parsed.data;
    checkPartyIds({ gstin: p.gstin || null, pan: p.pan || null });
    const before = await db.party.findFirst({ where: { id, companyId: ctx.company.id } });
    if (!before) throw new AccountingError("Party not found.");
    await db.$transaction(async (t) => {
      await t.party.update({ where: { id }, data: { kind: p.kind, gstin: p.gstin || null, pan: p.pan || (p.gstin ? p.gstin.slice(2, 12) : null), stateCode: p.stateCode || (p.gstin ? stateOfGstin(p.gstin) : before.stateCode), email: p.email || null, phone: p.phone || null, address: p.address || null, creditDays: p.creditDays, tdsSection: p.tdsSection || null } });
      await writeAudit(t, ctx, "party.update", "Party", id, { gstin: before.gstin, creditDays: before.creditDays }, { gstin: p.gstin, creditDays: p.creditDays });
    });
    revalidatePath("/parties");
    return null;
  });
}

// ───────────── Vouchers ─────────────

export async function reverseVoucherAction(id: string, reason: string) {
  return attempt(async () => {
    if (reason.trim().length < 3) throw new AccountingError("Give a short reason — it goes in the audit trail.");
    const rev = await reverseVoucher(await getCtx(), id, reason.trim());
    revalidatePath("/", "layout");
    return { number: rev.number };
  });
}

/** Amend = reverse the posted voucher and open a draft copy for editing on Home. */
export async function amendVoucherAction(id: string) {
  return attempt(async () => {
    const ctx = await getCtx();
    const v = await db.voucher.findFirst({ where: { id, companyId: ctx.company.id }, include: { lines: true } });
    if (!v) throw new AccountingError("Voucher not found.");
    if (v.source === "INVOICE" || v.source === "BILL") throw new AccountingError("Edit invoices and bills from their own pages (cancel and re-issue).");
    const draft = await db.$transaction(async (t) => {
      await reverseVoucher(ctx, id, "amended", t);
      return createDraft(ctx, { type: v.type, date: v.date, narration: v.narration, partyId: v.partyId, source: "MANUAL", aiInput: `Amendment of ${v.number}`, lines: v.lines.map((l) => ({ ledgerId: l.ledgerId, side: l.side, amountPaise: n(l.amountPaise) })) }, t);
    });
    revalidatePath("/", "layout");
    return { draftId: draft.id };
  });
}
