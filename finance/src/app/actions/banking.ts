"use server";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { db, n } from "@/lib/db";
import { getCtx } from "@/lib/session";
import { assertCanWrite } from "@/lib/roles";
import { AccountingError, createAndPost, writeAudit } from "@/lib/accounting/post";
import { parseTable } from "@/lib/bank/parse";
import { autoMatch } from "@/lib/bank/reconcile";
import { attempt } from "./result";

async function bankLedger(companyId: string, id: string) {
  const l = await db.ledger.findFirst({ where: { id, companyId, kind: { in: ["BANK", "CASH"] } } });
  if (!l) throw new AccountingError("Choose a bank account.");
  return l;
}

async function readTable(file: File): Promise<unknown[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    return Papa.parse<string[]>(await file.text(), { skipEmptyLines: true }).data;
  }
  if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const out: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as unknown[]).slice(1).map((v) => (v && typeof v === "object" && "result" in (v as object) ? (v as { result: unknown }).result : v && typeof v === "object" && "text" in (v as object) ? (v as { text: unknown }).text : v));
      out.push(vals);
    });
    return out;
  }
  throw new AccountingError("Upload the statement as CSV or Excel (.xlsx).");
}

/** Import a statement, skip lines already imported, then auto-match against posted entries. */
export async function importStatementAction(form: FormData) {
  return attempt(async () => {
    const ctx = await getCtx();
    assertCanWrite(ctx);
    const ledger = await bankLedger(ctx.company.id, String(form.get("ledgerId")));
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new AccountingError("Choose a statement file.");
    if (file.size > 5 * 1024 * 1024) throw new AccountingError("Statement is over 5 MB — split it by month.");
    const { rows, skipped, error } = parseTable(await readTable(file));
    if (error) throw new AccountingError(error);
    const existing = await db.bankTxn.findMany({ where: { companyId: ctx.company.id, ledgerId: ledger.id }, select: { date: true, amountPaise: true, description: true } });
    const seen = new Set(existing.map((e) => `${e.date.toISOString().slice(0, 10)}|${n(e.amountPaise)}|${e.description}`));
    const fresh = rows.filter((r) => !seen.has(`${r.date}|${r.amountPaise}|${r.description}`));
    const batch = `import-${Date.now()}`;
    if (fresh.length) await db.bankTxn.createMany({ data: fresh.map((r) => ({ companyId: ctx.company.id, ledgerId: ledger.id, date: new Date(r.date + "T00:00:00Z"), description: r.description, reference: r.reference, amountPaise: BigInt(r.amountPaise), balancePaise: r.balancePaise == null ? null : BigInt(r.balancePaise), importBatch: batch })) });
    const matched = await autoMatch(ctx.company.id, ledger.id);
    await db.$transaction((t) => writeAudit(t, ctx, "bank.import", "Ledger", ledger.id, undefined, { file: file.name, imported: fresh.length, duplicates: rows.length - fresh.length, matched }));
    revalidatePath("/banking");
    return { imported: fresh.length, duplicates: rows.length - fresh.length, skipped, matched };
  });
}

export async function autoMatchAction(ledgerId: string) {
  return attempt(async () => {
    const ctx = await getCtx();
    assertCanWrite(ctx);
    await bankLedger(ctx.company.id, ledgerId);
    const matched = await autoMatch(ctx.company.id, ledgerId);
    revalidatePath("/banking");
    return { matched };
  });
}

export async function matchTxnAction(txnId: string, voucherId: string) {
  return attempt(async () => {
    const ctx = await getCtx();
    assertCanWrite(ctx);
    const t = await db.bankTxn.findFirst({ where: { id: txnId, companyId: ctx.company.id } });
    const v = await db.voucher.findFirst({ where: { id: voucherId, companyId: ctx.company.id, status: "POSTED" }, include: { lines: true } });
    if (!t || !v) throw new AccountingError("Not found.");
    const onLedger = v.lines.find((l) => l.ledgerId === t.ledgerId);
    if (!onLedger || (onLedger.side === "DR" ? 1 : -1) * n(onLedger.amountPaise) !== n(t.amountPaise)) throw new AccountingError("That entry's amount on this account doesn't match the statement line.");
    await db.bankTxn.update({ where: { id: t.id }, data: { status: "MATCHED", voucherId } });
    revalidatePath("/banking");
    return null;
  });
}

/** Statement line with no book entry yet → post one (receipt or payment) and match it. */
export async function createFromTxnAction(txnId: string, counterLedgerId: string, narration: string) {
  return attempt(async () => {
    const ctx = await getCtx();
    assertCanWrite(ctx);
    const t = await db.bankTxn.findFirst({ where: { id: txnId, companyId: ctx.company.id, status: "UNMATCHED" } });
    if (!t) throw new AccountingError("Statement line not found.");
    const counter = await db.ledger.findFirst({ where: { id: counterLedgerId, companyId: ctx.company.id } });
    if (!counter) throw new AccountingError("Choose a ledger.");
    const amt = n(t.amountPaise);
    const party = await db.party.findFirst({ where: { ledgerId: counter.id } });
    const v = await createAndPost(ctx, {
      type: amt > 0 ? "RECEIPT" : "PAYMENT", date: t.date, source: "BANK", partyId: party?.id ?? null, narration: narration || t.description,
      lines: amt > 0 ? [{ ledgerId: t.ledgerId, side: "DR", amountPaise: amt }, { ledgerId: counter.id, side: "CR", amountPaise: amt }] : [{ ledgerId: counter.id, side: "DR", amountPaise: -amt }, { ledgerId: t.ledgerId, side: "CR", amountPaise: -amt }],
    });
    await db.bankTxn.update({ where: { id: t.id }, data: { status: "MATCHED", voucherId: v.id } });
    revalidatePath("/", "layout");
    return { number: v.number };
  });
}

export async function setTxnStatusAction(txnId: string, status: "IGNORED" | "UNMATCHED") {
  return attempt(async () => {
    const ctx = await getCtx();
    assertCanWrite(ctx);
    const r = await db.bankTxn.updateMany({ where: { id: txnId, companyId: ctx.company.id }, data: { status, voucherId: null } });
    if (!r.count) throw new AccountingError("Statement line not found.");
    revalidatePath("/banking");
    return null;
  });
}
