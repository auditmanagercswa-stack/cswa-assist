import { describe, expect, it } from "vitest";
import { balanceSheet, profitAndLoss, scheduleIIIPL, trialBalance, type GroupRow, type LedgerRow, type Movement } from "@/lib/accounting/reports";

const G = (id: string, nature: GroupRow["nature"], extra: Partial<GroupRow> = {}): GroupRow => ({ id, name: id, nature, parentId: null, schedule3: null, isDirect: false, sortOrder: 0, ...extra });
const groups = [G("Capital", "LIABILITY", { schedule3: "Share capital" }), G("Bank", "ASSET", { schedule3: "Cash and cash equivalents" }), G("Debtors", "ASSET", { schedule3: "Trade receivables" }), G("Duties", "LIABILITY", { schedule3: "Other current liabilities" }), G("Sales", "INCOME", { isDirect: true, schedule3: "Revenue from operations" }), G("Purchases", "EXPENSE", { isDirect: true, schedule3: "Purchases" }), G("Rent", "EXPENSE", { schedule3: "Other expenses" })];
const ledgers: LedgerRow[] = [
  { id: "cap", name: "Capital", groupId: "Capital", openingPaise: -100000 },
  { id: "bank", name: "Bank", groupId: "Bank", openingPaise: 100000 },
  { id: "deb", name: "Debtor", groupId: "Debtors", openingPaise: 0 },
  { id: "gst", name: "Input GST", groupId: "Duties", openingPaise: 0 },
  { id: "sales", name: "Sales", groupId: "Sales", openingPaise: 0 },
  { id: "pur", name: "Purchases", groupId: "Purchases", openingPaise: 0 },
  { id: "rent", name: "Rent", groupId: "Rent", openingPaise: 0 },
];
// Period: sold 50,000 on credit, bought 20,000 (+ GST 3,600) from bank, paid rent 5,000.
const moves: Movement[] = [
  { ledgerId: "deb", drBefore: 0, crBefore: 0, dr: 50000, cr: 0 },
  { ledgerId: "sales", drBefore: 0, crBefore: 0, dr: 0, cr: 50000 },
  { ledgerId: "pur", drBefore: 0, crBefore: 0, dr: 20000, cr: 0 },
  { ledgerId: "gst", drBefore: 0, crBefore: 0, dr: 3600, cr: 0 },
  { ledgerId: "rent", drBefore: 0, crBefore: 0, dr: 5000, cr: 0 },
  { ledgerId: "bank", drBefore: 0, crBefore: 0, dr: 0, cr: 28600 },
];

describe("reports", () => {
  const tb = trialBalance(groups, ledgers, moves);
  it("trial balance closes to zero", () => {
    expect(tb.reduce((t, r) => t + r.closing, 0)).toBe(0);
    expect(tb.find((r) => r.ledgerId === "bank")!.closing).toBe(71400);
  });
  it("P&L: gross and net profit", () => {
    const pl = profitAndLoss(groups, tb);
    expect(pl.grossProfit).toBe(30000);
    expect(pl.netProfit).toBe(25000);
    expect(pl.income).toBe(50000);
    expect(pl.expenses).toBe(25000);
    expect(scheduleIIIPL(groups, tb).profitBeforeTax).toBe(25000);
  });
  it("balance sheet balances and moves a debit-balance liability to assets", () => {
    const bs = balanceSheet(groups, tb, true);
    expect(bs.totalAssets).toBe(bs.totalLiabilities);
    expect(bs.liabilities.find((x) => x.label === "Surplus in Profit & Loss")!.amount).toBe(25000);
    expect(bs.assets.find((x) => x.label.startsWith("Other current liabilities"))!.amount).toBe(3600);
  });
  it("flags unbalanced opening balances instead of hiding them", () => {
    const skew = ledgers.map((l) => (l.id === "bank" ? { ...l, openingPaise: 100500 } : l));
    const bs = balanceSheet(groups, trialBalance(groups, skew, moves), false);
    expect(bs.liabilities.find((x) => x.label === "Difference in opening balances")!.amount).toBe(500);
  });
  it("P&L ledgers restart at the FY start", () => {
    const prior = new Map([["rent", { dr: 9000, cr: 0 }]]);
    const withPrior = moves.map((m) => (m.ledgerId === "rent" ? { ...m, drBefore: 9000 } : m));
    const t = trialBalance(groups, ledgers, withPrior, { fyStartMovesForPL: prior });
    expect(t.find((r) => r.ledgerId === "rent")!.opening).toBe(0);
  });
});
