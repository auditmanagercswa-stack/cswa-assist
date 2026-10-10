/**
 * Read-only query tools for "Ask your books". Every tool:
 *  - takes validated parameters (zod), never raw SQL from the model,
 *  - is scoped to the caller's companyId,
 *  - returns figures (paise + formatted), an optional chart series and a link to the underlying ledger/report.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, n } from "@/lib/db";
import { inr, isoDate } from "@/lib/format";
import { balancesAsOf, getProfitAndLoss, taxHeadTotals } from "@/lib/accounting/ledger";

export interface ToolResult {
  summary: Record<string, unknown>;
  chart?: { kind: "bar" | "line"; title: string; data: { label: string; value: number }[] };
  link?: { href: string; label: string };
}

const Range = { from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) };
const d = (s: string) => new Date(s + "T00:00:00Z");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function monthly(companyId: string, ledgerIds: string[], from: Date, to: Date, sign: 1 | -1) {
  if (!ledgerIds.length) return [];
  const rows = await db.$queryRaw<{ m: Date; net: bigint }[]>`
    SELECT date_trunc('month', v.date)::date AS m,
           SUM(CASE WHEN vl.side='DR' THEN vl."amountPaise" ELSE -vl."amountPaise" END)::bigint AS net
    FROM "VoucherLine" vl JOIN "Voucher" v ON v.id = vl."voucherId"
    WHERE v."companyId" = ${companyId} AND v.status IN ('POSTED','REVERSED') AND v.date BETWEEN ${from} AND ${to}
      AND vl."ledgerId" IN (${Prisma.join(ledgerIds)})
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({ label: `${MON[r.m.getUTCMonth()]} ${String(r.m.getUTCFullYear()).slice(2)}`, value: (sign * n(r.net)) / 100 }));
}

async function matchLedgers(companyId: string, name: string) {
  const q = name.trim().toLowerCase();
  const all = await db.ledger.findMany({ where: { companyId }, include: { group: true } });
  const exact = all.filter((l) => l.name.toLowerCase() === q || l.aliases.includes(q));
  if (exact.length) return exact;
  const byGroup = all.filter((l) => l.group.name.toLowerCase() === q);
  if (byGroup.length) return byGroup;
  return all.filter((l) => l.name.toLowerCase().includes(q) || l.aliases.some((a) => a.includes(q) || q.includes(a)));
}

export const TOOLS = {
  spend_on: {
    description: "Total spent (debits net of credits) on an expense ledger or group (e.g. Rent, Salaries & Wages, Indirect Expenses) in a date range, with a monthly series.",
    input: z.object({ ledger: z.string(), ...Range }),
    async run(companyId: string, a: { ledger: string; from: string; to: string }): Promise<ToolResult> {
      const ls = await matchLedgers(companyId, a.ledger);
      if (!ls.length) return { summary: { error: `No ledger matches "${a.ledger}".` } };
      const series = await monthly(companyId, ls.map((l) => l.id), d(a.from), d(a.to), 1);
      const total = Math.round(series.reduce((t, x) => t + x.value, 0) * 100);
      return { summary: { ledgers: ls.map((l) => l.name), from: a.from, to: a.to, total: inr(total), totalPaise: total }, chart: { kind: "bar", title: `${ls.length === 1 ? ls[0].name : a.ledger} by month`, data: series }, link: { href: `/reports/ledger?ledger=${ls[0].id}`, label: `Open ${ls[0].name} ledger` } };
    },
  },
  income: {
    description: "Total income (sales and other income) in a date range with a monthly series.",
    input: z.object(Range),
    async run(companyId: string, a: { from: string; to: string }): Promise<ToolResult> {
      const ls = await db.ledger.findMany({ where: { companyId, group: { nature: "INCOME" } } });
      const series = await monthly(companyId, ls.map((l) => l.id), d(a.from), d(a.to), -1);
      const total = Math.round(series.reduce((t, x) => t + x.value, 0) * 100);
      return { summary: { from: a.from, to: a.to, income: inr(total), incomePaise: total }, chart: { kind: "bar", title: "Income by month", data: series }, link: { href: "/reports/pl", label: "Open Profit & Loss" } };
    },
  },
  profit: {
    description: "Profit & loss totals (income, expenses, gross and net profit) for a date range.",
    input: z.object(Range),
    async run(companyId: string, a: { from: string; to: string }): Promise<ToolResult> {
      const pl = await getProfitAndLoss(companyId, d(a.from), d(a.to));
      return { summary: { from: a.from, to: a.to, income: inr(pl.income), expenses: inr(pl.expenses), grossProfit: inr(pl.grossProfit), netProfit: inr(pl.netProfit), marginPct: pl.income ? Math.round((pl.netProfit / pl.income) * 100) : 0 }, chart: { kind: "bar", title: "Income vs spent", data: [{ label: "Income", value: pl.income / 100 }, { label: "Spent", value: pl.expenses / 100 }, { label: "Net profit", value: pl.netProfit / 100 }] }, link: { href: "/reports/pl", label: "Open Profit & Loss" } };
    },
  },
  expense_breakdown: {
    description: "Top expense ledgers by amount in a date range.",
    input: z.object({ ...Range, limit: z.number().int().min(1).max(15).default(8) }),
    async run(companyId: string, a: { from: string; to: string; limit: number }): Promise<ToolResult> {
      const rows = await db.$queryRaw<{ name: string; id: string; net: bigint }[]>`
        SELECT l.name, l.id, SUM(CASE WHEN vl.side='DR' THEN vl."amountPaise" ELSE -vl."amountPaise" END)::bigint AS net
        FROM "VoucherLine" vl JOIN "Voucher" v ON v.id = vl."voucherId" JOIN "Ledger" l ON l.id = vl."ledgerId" JOIN "LedgerGroup" g ON g.id = l."groupId"
        WHERE v."companyId" = ${companyId} AND v.status IN ('POSTED','REVERSED') AND v.date BETWEEN ${d(a.from)} AND ${d(a.to)} AND g.nature = 'EXPENSE'
        GROUP BY l.name, l.id ORDER BY net DESC LIMIT ${a.limit}`;
      return { summary: { from: a.from, to: a.to, items: rows.map((r) => ({ ledger: r.name, amount: inr(n(r.net)) })) }, chart: { kind: "bar", title: "Where the money went", data: rows.map((r) => ({ label: r.name, value: n(r.net) / 100 })) }, link: { href: "/reports/pl", label: "Open Profit & Loss" } };
    },
  },
  top_debtors: {
    description: "Customers who owe the business the most right now (unpaid invoices), with ageing.",
    input: z.object({ limit: z.number().int().min(1).max(15).default(5) }),
    async run(companyId: string, a: { limit: number }): Promise<ToolResult> {
      const inv = await db.invoice.findMany({ where: { companyId, status: { in: ["ISSUED", "PARTIAL"] } }, include: { party: true } });
      const by = new Map<string, { name: string; out: number; oldestDue: Date }>();
      for (const i of inv) { const o = n(i.totalPaise) - n(i.paidPaise); const c = by.get(i.partyId) ?? { name: i.party.name, out: 0, oldestDue: i.dueDate }; c.out += o; if (i.dueDate < c.oldestDue) c.oldestDue = i.dueDate; by.set(i.partyId, c); }
      const top = [...by.values()].sort((x, y) => y.out - x.out).slice(0, a.limit);
      return { summary: { customers: top.map((t) => ({ name: t.name, outstanding: inr(t.out), oldestDue: isoDate(t.oldestDue) })), totalOutstanding: inr([...by.values()].reduce((t, x) => t + x.out, 0)) }, chart: { kind: "bar", title: "Outstanding by customer", data: top.map((t) => ({ label: t.name, value: t.out / 100 })) }, link: { href: "/receivables", label: "Open Receivables" } };
    },
  },
  top_creditors: {
    description: "Vendors the business owes the most right now (unpaid bills).",
    input: z.object({ limit: z.number().int().min(1).max(15).default(5) }),
    async run(companyId: string, a: { limit: number }): Promise<ToolResult> {
      const bills = await db.bill.findMany({ where: { companyId, status: { in: ["ISSUED", "PARTIAL"] } }, include: { party: true } });
      const by = new Map<string, { name: string; out: number }>();
      for (const b of bills) { const c = by.get(b.partyId) ?? { name: b.party.name, out: 0 }; c.out += n(b.payablePaise) - n(b.paidPaise); by.set(b.partyId, c); }
      const top = [...by.values()].sort((x, y) => y.out - x.out).slice(0, a.limit);
      return { summary: { vendors: top.map((t) => ({ name: t.name, outstanding: inr(t.out) })) }, chart: { kind: "bar", title: "Owed to vendors", data: top.map((t) => ({ label: t.name, value: t.out / 100 })) }, link: { href: "/payables", label: "Open Payables" } };
    },
  },
  cash_position: {
    description: "Current cash and bank balances, receivables and payables.",
    input: z.object({}),
    async run(companyId: string): Promise<ToolResult> {
      const b = await balancesAsOf(companyId, new Date());
      return { summary: { accounts: b.cashBank.map((x) => ({ name: x.name, balance: inr(x.balance) })), receivables: inr(b.receivables), payables: inr(b.payables) }, chart: { kind: "bar", title: "Cash & bank", data: b.cashBank.map((x) => ({ label: x.name, value: x.balance / 100 })) }, link: { href: "/banking", label: "Open Banking" } };
    },
  },
  gst_position: {
    description: "GST output tax, input tax credit and net payable for a date range.",
    input: z.object(Range),
    async run(companyId: string, a: { from: string; to: string }): Promise<ToolResult> {
      const t = await taxHeadTotals(companyId, d(a.from), d(a.to));
      return { summary: { from: a.from, to: a.to, outputTax: inr(t.totalOut), inputCredit: inr(t.totalIn), netPayable: inr(t.netPayable), carryForward: inr(t.carryForward) }, chart: { kind: "bar", title: "GST", data: [{ label: "Output", value: t.totalOut / 100 }, { label: "Input credit", value: t.totalIn / 100 }, { label: "Net payable", value: t.netPayable / 100 }] }, link: { href: "/gst", label: "Open GST" } };
    },
  },
} as const;

export type ToolName = keyof typeof TOOLS;

export async function runTool(companyId: string, name: string, input: unknown): Promise<ToolResult> {
  const tool = TOOLS[name as ToolName];
  if (!tool) return { summary: { error: `Unknown tool ${name}` } };
  const parsed = tool.input.safeParse(input ?? {});
  if (!parsed.success) return { summary: { error: "Invalid parameters", issues: parsed.error.issues.map((i) => i.message) } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tool.run as (c: string, a: any) => Promise<ToolResult>)(companyId, parsed.data);
}
