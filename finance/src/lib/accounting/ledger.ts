import { Prisma } from "@prisma/client";
import { db, n } from "@/lib/db";
import { fyRange, fyStartYear } from "@/lib/fy";
import { balanceSheet, profitAndLoss, rootOf, scheduleIIIPL, trialBalance, type GroupRow, type LedgerRow, type Movement } from "./reports";

const COUNTED = Prisma.sql`v.status IN ('POSTED','REVERSED')`;

export async function getChart(companyId: string) {
  const [groups, ledgers] = await Promise.all([
    db.ledgerGroup.findMany({ where: { companyId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.ledger.findMany({ where: { companyId }, orderBy: { name: "asc" } }),
  ]);
  const g: GroupRow[] = groups.map((x) => ({ id: x.id, name: x.name, nature: x.nature, parentId: x.parentId, schedule3: x.schedule3, isDirect: x.isDirect, sortOrder: x.sortOrder }));
  const l: (LedgerRow & { kind: string; taxHead: string | null })[] = ledgers.map((x) => ({ id: x.id, name: x.name, groupId: x.groupId, openingPaise: n(x.openingPaise), kind: x.kind, taxHead: x.taxHead }));
  return { groups: g, ledgers: l };
}

/** Per-ledger posted movement split into before-`from`, within [from, to], and before the FY start. */
async function movements(companyId: string, from: Date, to: Date, fyStart: Date) {
  const rows = await db.$queryRaw<{ ledgerId: string; drBefore: bigint; crBefore: bigint; dr: bigint; cr: bigint; drPre: bigint; crPre: bigint }[]>`
    SELECT vl."ledgerId",
      COALESCE(SUM(CASE WHEN v.date <  ${from} AND vl.side = 'DR' THEN vl."amountPaise" END), 0)::bigint AS "drBefore",
      COALESCE(SUM(CASE WHEN v.date <  ${from} AND vl.side = 'CR' THEN vl."amountPaise" END), 0)::bigint AS "crBefore",
      COALESCE(SUM(CASE WHEN v.date >= ${from} AND vl.side = 'DR' THEN vl."amountPaise" END), 0)::bigint AS dr,
      COALESCE(SUM(CASE WHEN v.date >= ${from} AND vl.side = 'CR' THEN vl."amountPaise" END), 0)::bigint AS cr,
      COALESCE(SUM(CASE WHEN v.date <  ${fyStart} AND vl.side = 'DR' THEN vl."amountPaise" END), 0)::bigint AS "drPre",
      COALESCE(SUM(CASE WHEN v.date <  ${fyStart} AND vl.side = 'CR' THEN vl."amountPaise" END), 0)::bigint AS "crPre"
    FROM "VoucherLine" vl JOIN "Voucher" v ON v.id = vl."voucherId"
    WHERE v."companyId" = ${companyId} AND ${COUNTED} AND v.date <= ${to}
    GROUP BY vl."ledgerId"`;
  const moves: Movement[] = rows.map((r) => ({ ledgerId: r.ledgerId, drBefore: n(r.drBefore), crBefore: n(r.crBefore), dr: n(r.dr), cr: n(r.cr) }));
  const preFy = new Map(rows.map((r) => [r.ledgerId, { dr: n(r.drPre), cr: n(r.crPre) }]));
  return { moves, preFy };
}

/** Trial balance for a period (P&L ledgers restart at the FY start). */
export async function getTrialBalance(companyId: string, from: Date, to: Date) {
  const { groups, ledgers } = await getChart(companyId);
  const { moves, preFy } = await movements(companyId, from, to, fyRange(fyStartYear(from)).from);
  return { groups, ledgers, rows: trialBalance(groups, ledgers, moves, { fyStartMovesForPL: preFy }) };
}

export async function getProfitAndLoss(companyId: string, from: Date, to: Date) {
  const { groups, rows } = await getTrialBalance(companyId, from, to);
  return { ...profitAndLoss(groups, rows), schedule3: scheduleIIIPL(groups, rows) };
}

export async function getBalanceSheet(companyId: string, asOf: Date, scheduleIII: boolean) {
  const { groups, ledgers } = await getChart(companyId);
  const { moves } = await movements(companyId, new Date("1900-01-01"), asOf, new Date("1900-01-01"));
  return balanceSheet(groups, trialBalance(groups, ledgers, moves), scheduleIII);
}

/** Closing balance per ledger kind/group, used by the dashboard. */
export async function balancesAsOf(companyId: string, asOf: Date) {
  const { groups, ledgers } = await getChart(companyId);
  const { moves } = await movements(companyId, new Date("1900-01-01"), asOf, new Date("1900-01-01"));
  const tb = trialBalance(groups, ledgers, moves);
  const kind = new Map(ledgers.map((l) => [l.id, l.kind]));
  const root = (gid: string) => rootOf(groups, gid).name;
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  return {
    cashBank: tb.filter((r) => kind.get(r.ledgerId) === "CASH" || kind.get(r.ledgerId) === "BANK").map((r) => ({ id: r.ledgerId, name: r.ledger, kind: kind.get(r.ledgerId)!, balance: r.closing })),
    receivables: tb.filter((r) => groupName.get(r.groupId) === "Sundry Debtors").reduce((t, r) => t + r.closing, 0),
    payables: -tb.filter((r) => groupName.get(r.groupId) === "Sundry Creditors").reduce((t, r) => t + r.closing, 0),
    suspense: tb.filter((r) => kind.get(r.ledgerId) === "SUSPENSE" || root(r.groupId) === "Suspense A/c").reduce((t, r) => t + r.closing, 0),
  };
}

/** Ledger account statement with running balance (Dr positive). */
export async function ledgerStatement(companyId: string, ledgerId: string, from: Date, to: Date) {
  const ledger = await db.ledger.findFirst({ where: { id: ledgerId, companyId }, include: { group: true } });
  if (!ledger) return null;
  const isPL = ledger.group.nature === "INCOME" || ledger.group.nature === "EXPENSE";
  const fyStart = fyRange(fyStartYear(from)).from;
  const before = await db.voucherLine.groupBy({
    by: ["side"], _sum: { amountPaise: true },
    where: { ledgerId, voucher: { companyId, status: { in: ["POSTED", "REVERSED"] }, date: { lt: from, ...(isPL ? { gte: fyStart } : {}) } } },
  });
  let bal = (isPL ? 0 : n(ledger.openingPaise)) + before.reduce((t, b) => t + (b.side === "DR" ? 1 : -1) * n(b._sum.amountPaise), 0);
  const opening = bal;
  const lines = await db.voucherLine.findMany({
    where: { ledgerId, voucher: { companyId, status: { in: ["POSTED", "REVERSED"] }, date: { gte: from, lte: to } } },
    include: { voucher: { include: { lines: { include: { ledger: true } }, party: true } } },
    orderBy: [{ voucher: { date: "asc" } }, { voucher: { postedAt: "asc" } }],
  });
  const rows = lines.map((l) => {
    const amt = n(l.amountPaise);
    bal += l.side === "DR" ? amt : -amt;
    const contra = l.voucher.lines.filter((x) => x.ledgerId !== ledgerId).map((x) => x.ledger.name);
    return { id: l.voucher.id, date: l.voucher.date, number: l.voucher.number, type: l.voucher.type, narration: l.voucher.narration, particulars: [...new Set(contra)].join(", "), dr: l.side === "DR" ? amt : 0, cr: l.side === "CR" ? amt : 0, balance: bal, reversed: l.voucher.status === "REVERSED" || !!l.voucher.reversalOfId };
  });
  return { ledger, opening, rows, closing: bal };
}

export async function dayBook(companyId: string, from: Date, to: Date) {
  const vs = await db.voucher.findMany({
    where: { companyId, status: { in: ["POSTED", "REVERSED"] }, date: { gte: from, lte: to } },
    include: { lines: { include: { ledger: true }, orderBy: { sortOrder: "asc" } }, party: true },
    orderBy: [{ date: "asc" }, { postedAt: "asc" }],
  });
  return vs.map((v) => ({ id: v.id, date: v.date, number: v.number, type: v.type, narration: v.narration, party: v.party?.name ?? null, status: v.status, reversal: !!v.reversalOfId, lines: v.lines.map((l) => ({ ledger: l.ledger.name, side: l.side, amount: n(l.amountPaise) })) }));
}

/**
 * Cash flow (direct method): every cash/bank movement classified by the other side of its voucher —
 * fixed assets & investments → investing; capital & loans → financing; everything else → operating.
 */
export async function cashFlow(companyId: string, from: Date, to: Date) {
  const { groups } = await getChart(companyId);
  const cashLedgers = await db.ledger.findMany({ where: { companyId, kind: { in: ["CASH", "BANK"] } }, select: { id: true } });
  const cashIds = new Set(cashLedgers.map((c) => c.id));
  const vs = await db.voucher.findMany({
    where: { companyId, status: { in: ["POSTED", "REVERSED"] }, date: { gte: from, lte: to }, lines: { some: { ledgerId: { in: [...cashIds] } } } },
    include: { lines: { include: { ledger: true } } },
  });
  const cat = (groupId: string) => {
    const r = rootOf(groups, groupId).name;
    if (r === "Fixed Assets" || r === "Investments") return "investing";
    if (r === "Capital Account" || r === "Loans (Liability)" || r === "Reserves & Surplus") return "financing";
    return "operating";
  };
  const out = { operating: { in: 0, out: 0 }, investing: { in: 0, out: 0 }, financing: { in: 0, out: 0 } };
  const detail = new Map<string, number>();
  for (const v of vs) {
    const cashNet = v.lines.filter((l) => cashIds.has(l.ledgerId)).reduce((t, l) => t + (l.side === "DR" ? 1 : -1) * n(l.amountPaise), 0);
    if (cashNet === 0) continue; // contra between cash & bank
    const others = v.lines.filter((l) => !cashIds.has(l.ledgerId));
    const main = others.sort((a, b) => n(b.amountPaise) - n(a.amountPaise))[0];
    const c = main ? cat(main.ledger.groupId) : "operating";
    if (cashNet > 0) out[c].in += cashNet; else out[c].out += -cashNet;
    const label = `${c}:${main ? rootOf(groups, main.ledger.groupId).name : "Other"}`;
    detail.set(label, (detail.get(label) ?? 0) + cashNet);
  }
  const opening = await cashBalanceAt(companyId, new Date(from.getTime() - 86400000));
  const net = (["operating", "investing", "financing"] as const).reduce((t, k) => t + out[k].in - out[k].out, 0);
  return { ...out, detail: [...detail].map(([k, v]) => ({ category: k.split(":")[0], label: k.split(":")[1], amount: v })), opening, net, closing: opening + net };
}

async function cashBalanceAt(companyId: string, asOf: Date) {
  const b = await balancesAsOf(companyId, asOf);
  return b.cashBank.reduce((t, x) => t + x.balance, 0);
}

/** Movement on each tax head within a period (credit − debit for OUT, debit − credit for IN). */
export async function taxHeadTotals(companyId: string, from: Date, to: Date) {
  const rows = await db.$queryRaw<{ taxHead: string; dr: bigint; cr: bigint }[]>`
    SELECT l."taxHead", COALESCE(SUM(CASE WHEN vl.side='DR' THEN vl."amountPaise" END),0)::bigint AS dr,
           COALESCE(SUM(CASE WHEN vl.side='CR' THEN vl."amountPaise" END),0)::bigint AS cr
    FROM "VoucherLine" vl JOIN "Voucher" v ON v.id = vl."voucherId" JOIN "Ledger" l ON l.id = vl."ledgerId"
    WHERE v."companyId" = ${companyId} AND ${COUNTED} AND v.date BETWEEN ${from} AND ${to} AND l."taxHead" IS NOT NULL
      AND v.type <> 'PAYMENT'
    GROUP BY l."taxHead"`;
  const m = Object.fromEntries(rows.map((r) => [r.taxHead, { dr: n(r.dr), cr: n(r.cr) }]));
  const out = (h: string) => (m[h] ? m[h].cr - m[h].dr : 0);
  const inp = (h: string) => (m[h] ? m[h].dr - m[h].cr : 0);
  const output = { cgst: out("CGST_OUT"), sgst: out("SGST_OUT"), igst: out("IGST_OUT") };
  const input = { cgst: inp("CGST_IN"), sgst: inp("SGST_IN"), igst: inp("IGST_IN") };
  const rcm = out("RCM_PAYABLE");
  const totalOut = output.cgst + output.sgst + output.igst, totalIn = input.cgst + input.sgst + input.igst;
  return { output, input, rcm, totalOut, totalIn, netPayable: Math.max(0, totalOut + rcm - totalIn), carryForward: Math.max(0, totalIn - totalOut - rcm), tdsDeducted: out("TDS_PAYABLE") };
}

/** GSTR-1 working from issued invoices: B2B, B2C and HSN summary. */
export async function gstr1Working(companyId: string, from: Date, to: Date) {
  const inv = await db.invoice.findMany({ where: { companyId, date: { gte: from, lte: to }, status: { not: "CANCELLED" } }, include: { party: true, items: true }, orderBy: { date: "asc" } });
  const b2b = inv.filter((i) => i.party.gstin);
  const b2c = inv.filter((i) => !i.party.gstin);
  const hsn = new Map<string, { hsn: string; qty: number; taxable: number; rate: number }>();
  for (const i of inv) for (const it of i.items) {
    const k = `${it.hsn ?? "NA"}@${it.gstRate}`;
    const cur = hsn.get(k) ?? { hsn: it.hsn ?? "—", qty: 0, taxable: 0, rate: it.gstRate };
    cur.qty += it.qty; cur.taxable += n(it.taxablePaise);
    hsn.set(k, cur);
  }
  const sum = (xs: typeof inv) => ({ count: xs.length, taxable: xs.reduce((t, i) => t + n(i.taxablePaise), 0), tax: xs.reduce((t, i) => t + n(i.cgstPaise) + n(i.sgstPaise) + n(i.igstPaise), 0) });
  return { b2b, b2c, b2bTotals: sum(b2b), b2cTotals: sum(b2c), hsn: [...hsn.values()] };
}

/** ITC register from purchase bills. */
export async function itcRegister(companyId: string, from: Date, to: Date) {
  return db.bill.findMany({ where: { companyId, date: { gte: from, lte: to }, status: { not: "CANCELLED" } }, include: { party: true }, orderBy: { date: "asc" } });
}

/** TDS deducted (from voucher.tds metadata) grouped by section, and deposits made. */
export async function tdsSummary(companyId: string, from: Date, to: Date) {
  const vs = await db.voucher.findMany({ where: { companyId, status: "POSTED", reversalOfId: null, date: { gte: from, lte: to }, NOT: { tds: { equals: Prisma.DbNull } } }, include: { party: true } });
  const bySection = new Map<string, { section: string; count: number; amount: number; base: number }>();
  const rows = vs.map((v) => {
    const t = v.tds as { section?: string; rate?: number; amountPaise?: number; basePaise?: number } | null;
    const s = t?.section ?? "—";
    const cur = bySection.get(s) ?? { section: s, count: 0, amount: 0, base: 0 };
    cur.count++; cur.amount += t?.amountPaise ?? 0; cur.base += t?.basePaise ?? 0;
    bySection.set(s, cur);
    return { id: v.id, date: v.date, number: v.number, party: v.party?.name ?? "—", pan: v.party?.pan ?? null, section: s, rate: t?.rate ?? 0, base: t?.basePaise ?? 0, amount: t?.amountPaise ?? 0 };
  });
  const tdsLedger = await db.ledger.findFirst({ where: { companyId, taxHead: "TDS_PAYABLE" } });
  const deposited = tdsLedger ? await db.voucherLine.aggregate({ _sum: { amountPaise: true }, where: { ledgerId: tdsLedger.id, side: "DR", voucher: { companyId, status: { in: ["POSTED", "REVERSED"] }, date: { gte: from, lte: to } } } }) : null;
  return { rows, sections: [...bySection.values()], deposited: n(deposited?._sum.amountPaise) };
}
