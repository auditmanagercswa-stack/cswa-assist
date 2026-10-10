import "server-only";
import { db, n } from "@/lib/db";
import type { Ctx } from "@/lib/session";
import { todayUTC, daysBetween, utc } from "@/lib/fy";
import { healthScore } from "@/lib/accounting/core";
import { balancesAsOf, getProfitAndLoss, taxHeadTotals } from "@/lib/accounting/ledger";
import { ensureDueDates } from "@/lib/company";

const IST_MS = 5.5 * 3600 * 1000;
/** Calendar day in India for a timestamp, as yyyy-mm-dd. */
const istDay = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);

export async function healthFor(companyId: string) {
  const today = todayUTC();
  const [unrec, drafts, overdue, missing, bal] = await Promise.all([
    db.bankTxn.count({ where: { companyId, status: "UNMATCHED" } }),
    db.voucher.count({ where: { companyId, status: "DRAFT" } }),
    db.dueDate.count({ where: { companyId, status: "PENDING", dueOn: { lt: today } } }),
    db.party.count({ where: { companyId, gstin: null, NOT: { name: { startsWith: "Walk-in" } } } }),
    balancesAsOf(companyId, today),
  ]);
  return { ...healthScore({ unreconciledBankLines: unrec, unpostedDrafts: drafts, overdueFilings: overdue, partiesMissingGstin: missing, suspenseBalancePaise: bal.suspense }), drafts, overdue, unrec };
}

/** Consecutive days (ending today, or yesterday if nothing yet today) with at least one entry recorded. */
async function streak(companyId: string) {
  const since = new Date(Date.now() - 90 * 86400000);
  const rows = await db.voucher.findMany({ where: { companyId, createdAt: { gte: since }, source: { notIn: ["SEED", "TALLY"] } }, select: { createdAt: true } });
  const days = new Set(rows.map((r) => istDay(r.createdAt)));
  let d = new Date();
  if (!days.has(istDay(d))) d = new Date(d.getTime() - 86400000);
  let count = 0;
  while (days.has(istDay(d))) { count++; d = new Date(d.getTime() - 86400000); }
  return count;
}

export async function homeData(ctx: Ctx) {
  const cid = ctx.company.id;
  const today = todayUTC();
  const asOf = ctx.period.to < today ? ctx.period.to : today;
  await ensureDueDates(db, cid, ctx.fy);

  const [pl, bal, health, streakDays, recent, dues, lastEntry] = await Promise.all([
    getProfitAndLoss(cid, ctx.period.from, ctx.period.to),
    balancesAsOf(cid, asOf),
    healthFor(cid),
    streak(cid),
    db.voucher.findMany({
      where: { companyId: cid, reversalOfId: null, source: { in: ["CHAT", "OCR", "MANUAL"] } },
      include: { lines: { include: { ledger: true }, orderBy: { sortOrder: "asc" } }, reversedBy: true },
      orderBy: { createdAt: "desc" }, take: 8,
    }),
    db.dueDate.findMany({ where: { companyId: cid, status: "PENDING", dueOn: { gte: new Date(today.getTime() - 60 * 86400000) } }, orderBy: { dueOn: "asc" }, take: 7 }),
    db.voucher.findFirst({ where: { companyId: cid }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  // GSTR-3B tiles show the tax computed from the books for that month.
  const dueTiles = await Promise.all(dues.map(async (d) => {
    let extra: string | null = null;
    if (d.code === "GSTR3B") {
      const [y, m] = d.period.split("-").map(Number);
      const t = await taxHeadTotals(cid, utc(y, m - 1, 1), utc(y, m, 0));
      extra = t.netPayable > 0 ? `Tax payable ${t.netPayable}` : `ITC carried forward ${t.carryForward}`;
    }
    return { id: d.id, code: d.code, title: d.title, subtitle: d.subtitle, dueOn: d.dueOn, daysLeft: daysBetween(today, d.dueOn), extra };
  }));

  const hour = new Date(Date.now() + IST_MS).getUTCHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const fresh = lastEntry ? Date.now() - lastEntry.createdAt.getTime() < 2 * 86400000 : false;
  const status = health.drafts ? `${health.drafts} draft${health.drafts > 1 ? "s" : ""} waiting for you` : fresh ? "books are up to date" : "nothing recorded for a couple of days";

  return {
    greeting, status, statusOk: !health.drafts && fresh,
    health: health.score, healthIssues: health.issues.map((i) => i.why), streak: streakDays,
    profit: { income: pl.income, expenses: pl.expenses, net: pl.netProfit },
    cashBank: bal.cashBank, receivables: bal.receivables, payables: bal.payables,
    recent: recent.map((v) => ({
      id: v.id, status: v.status, number: v.number, type: v.type, date: v.date, narration: v.narration, aiInput: v.aiInput, source: v.source,
      reversed: !!v.reversedBy, amount: v.lines.filter((l) => l.side === "DR").reduce((t, l) => t + n(l.amountPaise), 0),
      lines: v.lines.map((l) => ({ ledger: l.ledger.name, side: l.side, amount: n(l.amountPaise) })),
    })),
    dues: dueTiles,
    hasTan: !!ctx.company.tan,
  };
}
export type HomeData = Awaited<ReturnType<typeof homeData>>;
