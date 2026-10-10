/**
 * Pure report builders. Inputs are plain arrays so the maths is testable without a DB;
 * src/lib/accounting/ledger.ts feeds them from Prisma.
 */
import type { Nature } from "@prisma/client";

export interface GroupRow { id: string; name: string; nature: Nature; parentId: string | null; schedule3: string | null; isDirect: boolean; sortOrder: number }
export interface LedgerRow { id: string; name: string; groupId: string; openingPaise: number }
/** Posted movement per ledger: before the period and within it. */
export interface Movement { ledgerId: string; drBefore: number; crBefore: number; dr: number; cr: number }

export interface TBRow { ledgerId: string; ledger: string; groupId: string; group: string; nature: Nature; opening: number; dr: number; cr: number; closing: number }

/** Trial balance. Opening for income/expense ledgers excludes earlier-FY movement (P&L restarts each FY). */
export function trialBalance(groups: GroupRow[], ledgers: LedgerRow[], moves: Movement[], opts: { fyStartMovesForPL?: Map<string, { dr: number; cr: number }> } = {}): TBRow[] {
  const g = new Map(groups.map((x) => [x.id, x]));
  const m = new Map(moves.map((x) => [x.ledgerId, x]));
  return ledgers
    .map((l) => {
      const grp = g.get(l.groupId)!;
      const mv = m.get(l.id) ?? { drBefore: 0, crBefore: 0, dr: 0, cr: 0 };
      const isPL = grp.nature === "INCOME" || grp.nature === "EXPENSE";
      let opening = l.openingPaise + mv.drBefore - mv.crBefore;
      if (isPL && opts.fyStartMovesForPL) {
        const prior = opts.fyStartMovesForPL.get(l.id);
        opening -= prior ? prior.dr - prior.cr : 0;
      }
      return { ledgerId: l.id, ledger: l.name, groupId: grp.id, group: grp.name, nature: grp.nature, opening, dr: mv.dr, cr: mv.cr, closing: opening + mv.dr - mv.cr };
    })
    .filter((r) => r.opening !== 0 || r.dr !== 0 || r.cr !== 0);
}

/** Primary (top-level) ancestor of a group. */
export function rootOf(groups: GroupRow[], id: string): GroupRow {
  const map = new Map(groups.map((x) => [x.id, x]));
  let cur = map.get(id)!;
  while (cur.parentId) cur = map.get(cur.parentId)!;
  return cur;
}

export interface PLSection { title: string; rows: { label: string; amount: number }[]; total: number }

/**
 * Profit & loss for the period from TB rows (closing − opening = period movement).
 * Income shown positive (credit), expenses positive (debit).
 */
export function profitAndLoss(groups: GroupRow[], tb: TBRow[]) {
  const map = new Map(groups.map((x) => [x.id, x]));
  const move = (r: TBRow) => r.dr - r.cr; // + debit
  const sum = (rows: TBRow[], sign: 1 | -1) => rows.reduce((t, r) => t + sign * move(r), 0);
  const direct = (r: TBRow) => {
    let cur = map.get(r.groupId)!;
    while (cur) { if (cur.isDirect) return true; cur = cur.parentId ? map.get(cur.parentId)! : (undefined as never); }
    return false;
  };
  const inc = tb.filter((r) => r.nature === "INCOME");
  const exp = tb.filter((r) => r.nature === "EXPENSE");
  const dInc = inc.filter(direct), iInc = inc.filter((r) => !direct(r));
  const dExp = exp.filter(direct), iExp = exp.filter((r) => !direct(r));
  const rows = (rs: TBRow[], sign: 1 | -1) => rs.map((r) => ({ label: r.ledger, amount: sign * move(r) })).filter((r) => r.amount !== 0);
  const grossProfit = sum(dInc, -1) - sum(dExp, 1);
  const netProfit = grossProfit + sum(iInc, -1) - sum(iExp, 1);
  const income = sum(inc, -1), expenses = sum(exp, 1);
  return {
    directIncome: { title: "Revenue", rows: rows(dInc, -1), total: sum(dInc, -1) } as PLSection,
    directExpense: { title: "Direct costs", rows: rows(dExp, 1), total: sum(dExp, 1) } as PLSection,
    indirectIncome: { title: "Other income", rows: rows(iInc, -1), total: sum(iInc, -1) } as PLSection,
    indirectExpense: { title: "Operating expenses", rows: rows(iExp, 1), total: sum(iExp, 1) } as PLSection,
    grossProfit, netProfit, income, expenses,
  };
}

/** Schedule III style P&L lines keyed by each group's schedule3 head. */
export function scheduleIIIPL(groups: GroupRow[], tb: TBRow[]) {
  const map = new Map(groups.map((x) => [x.id, x]));
  const head = (r: TBRow) => map.get(r.groupId)?.schedule3 ?? (r.nature === "INCOME" ? "Other income" : "Other expenses");
  const agg = (nature: Nature, sign: 1 | -1) => {
    const out = new Map<string, number>();
    for (const r of tb.filter((x) => x.nature === nature)) out.set(head(r), (out.get(head(r)) ?? 0) + sign * (r.dr - r.cr));
    return [...out].map(([label, amount]) => ({ label, amount })).filter((x) => x.amount !== 0);
  };
  const income = agg("INCOME", -1), expenses = agg("EXPENSE", 1);
  const ti = income.reduce((t, x) => t + x.amount, 0), te = expenses.reduce((t, x) => t + x.amount, 0);
  return { income, expenses, totalIncome: ti, totalExpenses: te, profitBeforeTax: ti - te };
}

/**
 * Balance sheet as at period end. `tbToDate` must cover all postings up to the date.
 * Cumulative P&L (all income − expense) is shown under reserves as "Surplus in P&L".
 * Any imbalance from unbalanced opening balances shows as "Difference in opening balances".
 */
export function balanceSheet(groups: GroupRow[], tbToDate: TBRow[], scheduleIII: boolean) {
  const map = new Map(groups.map((x) => [x.id, x]));
  const key = (r: TBRow) => (scheduleIII ? map.get(r.groupId)?.schedule3 : rootOf(groups, r.groupId).name) ?? "Others";
  const side = (nature: Nature, sign: 1 | -1) => {
    const out = new Map<string, number>();
    for (const r of tbToDate.filter((x) => x.nature === nature)) out.set(key(r), (out.get(key(r)) ?? 0) + sign * r.closing);
    return [...out].map(([label, amount]) => ({ label, amount })).filter((x) => x.amount !== 0);
  };
  // Heads with a balance on the "wrong" side swap sides (GST credit → asset, bank overdraft → liability).
  const a0 = side("ASSET", 1), l0 = side("LIABILITY", -1);
  const assets = [...a0.filter((x) => x.amount > 0), ...l0.filter((x) => x.amount < 0).map((x) => ({ label: `${x.label} (debit balance)`, amount: -x.amount }))];
  const liabilities = [...l0.filter((x) => x.amount > 0), ...a0.filter((x) => x.amount < 0).map((x) => ({ label: `${x.label} (credit balance)`, amount: -x.amount }))];
  const pl = tbToDate.filter((r) => r.nature === "INCOME" || r.nature === "EXPENSE").reduce((t, r) => t - r.closing, 0);
  if (pl !== 0) liabilities.push({ label: "Surplus in Profit & Loss", amount: pl });
  const ta = assets.reduce((t, x) => t + x.amount, 0);
  let tl = liabilities.reduce((t, x) => t + x.amount, 0);
  if (ta !== tl) { liabilities.push({ label: "Difference in opening balances", amount: ta - tl }); tl = ta; }
  return { assets, liabilities, totalAssets: ta, totalLiabilities: tl };
}
