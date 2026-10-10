import { Prisma, type VoucherSource, type VoucherType } from "@prisma/client";
import { db, n } from "@/lib/db";
import { fyStartYear, utc } from "@/lib/fy";
import { assertCanWrite } from "@/lib/roles";
import type { Ctx } from "@/lib/session";
import { reverseLines, validateLines, type Line } from "./core";

export class AccountingError extends Error {}

export interface VoucherInput {
  type: VoucherType;
  date: Date;
  narration?: string | null;
  partyId?: string | null;
  source?: VoucherSource;
  reverseCharge?: boolean;
  tds?: Prisma.InputJsonValue | null;
  aiInput?: string | null;
  aiConfidence?: number | null;
  aiDraft?: Prisma.InputJsonValue | null;
  lines: (Line & { gst?: Prisma.InputJsonValue | null })[];
}

type Tx = Prisma.TransactionClient;

const PREFIX: Record<string, string> = {
  PAYMENT: "PMT", RECEIPT: "RCT", JOURNAL: "JV", SALES: "SL", PURCHASE: "PUR", CONTRA: "CTR", CREDIT_NOTE: "CN", DEBIT_NOTE: "DN", INVOICE: "INV",
};

/** Next number in a per-company, per-FY series, e.g. "PMT/26-27/0007". Atomic within the transaction. */
export async function nextNumber(tx: Tx, companyId: string, fy: number, key: string) {
  const s = await tx.numberSeries.upsert({
    where: { companyId_fy_key: { companyId, fy, key } },
    create: { companyId, fy, key, prefix: PREFIX[key] ?? key, next: 2 },
    update: { next: { increment: 1 } },
  });
  const used = s.next - 1;
  return `${s.prefix}/${String(fy % 100).padStart(2, "0")}-${String((fy + 1) % 100).padStart(2, "0")}/${String(used).padStart(4, "0")}`;
}

/** Ledgers referenced by the lines must belong to this company. */
async function assertLedgers(tx: Tx, companyId: string, lines: Line[]) {
  const ids = [...new Set(lines.map((l) => l.ledgerId))];
  const found = await tx.ledger.count({ where: { companyId, id: { in: ids } } });
  if (found !== ids.length) throw new AccountingError("One of the ledgers doesn't belong to this company.");
}

function assertOpen(lockedUpto: Date | null, date: Date) {
  if (lockedUpto && date <= lockedUpto) throw new AccountingError(`Books are locked up to ${lockedUpto.toISOString().slice(0, 10)}. Unlock the year in Settings to change it.`);
}

async function audit(tx: Tx, ctx: Ctx, action: string, entity: string, entityId: string, before?: unknown, after?: unknown) {
  await tx.auditLog.create({
    data: {
      companyId: ctx.company.id, userId: ctx.user.id, action, entity, entityId,
      before: before === undefined ? Prisma.JsonNull : (JSON.parse(JSON.stringify(before, bigintJson)) as Prisma.InputJsonValue),
      after: after === undefined ? Prisma.JsonNull : (JSON.parse(JSON.stringify(after, bigintJson)) as Prisma.InputJsonValue),
    },
  });
}
const bigintJson = (_k: string, v: unknown) => (typeof v === "bigint" ? Number(v) : v);

/** Save a draft (never posts). Drafts may be unbalanced while being edited, but lines must reference company ledgers. */
export async function createDraft(ctx: Ctx, input: VoucherInput, tx?: Tx) {
  assertCanWrite(ctx);
  const run = async (t: Tx) => {
    await assertLedgers(t, ctx.company.id, input.lines);
    const v = await t.voucher.create({
      data: {
        companyId: ctx.company.id, type: input.type, date: input.date, narration: input.narration ?? null, partyId: input.partyId ?? null,
        source: input.source ?? "MANUAL", reverseCharge: input.reverseCharge ?? false, tds: input.tds ?? Prisma.JsonNull,
        aiInput: input.aiInput ?? null, aiConfidence: input.aiConfidence ?? null, aiDraft: input.aiDraft ?? Prisma.JsonNull,
        createdById: ctx.user.id,
        lines: { create: input.lines.map((l, i) => ({ ledgerId: l.ledgerId, side: l.side, amountPaise: BigInt(l.amountPaise), gst: l.gst ?? Prisma.JsonNull, sortOrder: i })) },
      },
    });
    await audit(t, ctx, "voucher.draft", "Voucher", v.id, undefined, input);
    return v;
  };
  return tx ? run(tx) : db.$transaction(run);
}

/** Validate and post a draft. Posted vouchers are immutable. */
export async function postVoucher(ctx: Ctx, voucherId: string, tx?: Tx) {
  assertCanWrite(ctx);
  const run = async (t: Tx) => {
    const v = await t.voucher.findFirst({ where: { id: voucherId, companyId: ctx.company.id }, include: { lines: true } });
    if (!v) throw new AccountingError("Voucher not found.");
    if (v.status !== "DRAFT") throw new AccountingError("Only drafts can be posted.");
    const lines = v.lines.map((l) => ({ ledgerId: l.ledgerId, side: l.side, amountPaise: n(l.amountPaise) }));
    const errs = validateLines(lines);
    if (errs.length) throw new AccountingError(errs.join(" "));
    const company = await t.company.findUniqueOrThrow({ where: { id: ctx.company.id } });
    assertOpen(company.booksLockedUpto, v.date);
    const number = await nextNumber(t, ctx.company.id, fyStartYear(v.date), v.type);
    const posted = await t.voucher.update({ where: { id: v.id }, data: { status: "POSTED", number, postedAt: new Date(), postedById: ctx.user.id } });
    await audit(t, ctx, "voucher.post", "Voucher", v.id, { status: "DRAFT" }, { status: "POSTED", number, lines });
    return posted;
  };
  return tx ? run(tx) : db.$transaction(run);
}

/** Create and immediately post (used by invoices, bills, bank matches). */
export async function createAndPost(ctx: Ctx, input: VoucherInput, tx?: Tx) {
  const errs = validateLines(input.lines);
  if (errs.length) throw new AccountingError(errs.join(" "));
  const run = async (t: Tx) => postVoucher(ctx, (await createDraft(ctx, input, t)).id, t);
  return tx ? run(tx) : db.$transaction(run);
}

/**
 * Reverse a posted voucher: a new posted voucher with swapped sides on the same date.
 * The original is marked REVERSED; both stay in the books (net effect zero).
 */
export async function reverseVoucher(ctx: Ctx, voucherId: string, reason: string, tx?: Tx) {
  assertCanWrite(ctx);
  const run = async (t: Tx) => {
    const v = await t.voucher.findFirst({ where: { id: voucherId, companyId: ctx.company.id }, include: { lines: true } });
    if (!v) throw new AccountingError("Voucher not found.");
    if (v.status !== "POSTED") throw new AccountingError("Only posted vouchers can be reversed.");
    if (v.reversalOfId) throw new AccountingError("A reversal can't itself be reversed — post a fresh entry instead.");
    const company = await t.company.findUniqueOrThrow({ where: { id: ctx.company.id } });
    assertOpen(company.booksLockedUpto, v.date);
    const lines = reverseLines(v.lines.map((l) => ({ ledgerId: l.ledgerId, side: l.side, amountPaise: n(l.amountPaise), gst: l.gst ?? undefined })));
    const number = await nextNumber(t, ctx.company.id, fyStartYear(v.date), v.type);
    const rev = await t.voucher.create({
      data: {
        companyId: ctx.company.id, type: v.type, status: "POSTED", number, date: v.date, partyId: v.partyId, source: v.source,
        narration: `Reversal of ${v.number}: ${reason}`, reversalOfId: v.id, createdById: ctx.user.id, postedById: ctx.user.id, postedAt: new Date(),
        lines: { create: lines.map((l, i) => ({ ledgerId: l.ledgerId, side: l.side, amountPaise: BigInt(l.amountPaise), gst: (l.gst as Prisma.InputJsonValue) ?? Prisma.JsonNull, sortOrder: i })) },
      },
    });
    await t.voucher.update({ where: { id: v.id }, data: { status: "REVERSED" } });
    await t.bankTxn.updateMany({ where: { voucherId: v.id }, data: { status: "UNMATCHED", voucherId: null } });
    await audit(t, ctx, "voucher.reverse", "Voucher", v.id, { status: "POSTED", number: v.number }, { status: "REVERSED", reversal: rev.number, reason });
    return rev;
  };
  return tx ? run(tx) : db.$transaction(run);
}

/** "Edit" a posted voucher = reverse it and post the corrected version. */
export async function amendVoucher(ctx: Ctx, voucherId: string, input: VoucherInput) {
  return db.$transaction(async (t) => {
    await reverseVoucher(ctx, voucherId, "amended", t);
    const fresh = await createAndPost(ctx, input, t);
    await audit(t, ctx, "voucher.amend", "Voucher", voucherId, undefined, { replacement: fresh.id });
    return fresh;
  });
}

export async function deleteDraft(ctx: Ctx, voucherId: string) {
  assertCanWrite(ctx);
  return db.$transaction(async (t) => {
    const v = await t.voucher.findFirst({ where: { id: voucherId, companyId: ctx.company.id, status: "DRAFT" } });
    if (!v) throw new AccountingError("Draft not found.");
    await t.voucher.delete({ where: { id: v.id } });
    await audit(t, ctx, "voucher.discard", "Voucher", v.id, { narration: v.narration }, undefined);
  });
}

/** Close an FY: nothing dated on or before 31 March of that FY can be posted or reversed. */
export async function lockFy(ctx: Ctx, fy: number) {
  if (ctx.role !== "OWNER") throw new AccountingError("Only the owner can lock a year.");
  const upto = utc(fy + 1, 2, 31);
  await db.$transaction(async (t) => {
    await t.company.update({ where: { id: ctx.company.id }, data: { booksLockedUpto: upto } });
    await audit(t, ctx, "fy.lock", "Company", ctx.company.id, { booksLockedUpto: ctx.company.booksLockedUpto }, { booksLockedUpto: upto });
  });
}
export async function unlockBooks(ctx: Ctx) {
  if (ctx.role !== "OWNER") throw new AccountingError("Only the owner can unlock books.");
  await db.$transaction(async (t) => {
    await t.company.update({ where: { id: ctx.company.id }, data: { booksLockedUpto: null } });
    await audit(t, ctx, "fy.unlock", "Company", ctx.company.id, { booksLockedUpto: ctx.company.booksLockedUpto }, { booksLockedUpto: null });
  });
}

export { audit as writeAudit };
