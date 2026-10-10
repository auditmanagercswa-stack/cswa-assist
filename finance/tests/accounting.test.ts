import { describe, expect, it } from "vitest";
import { ageing, bucketFor, gstFromInclusive, gstSplit, gstinCheckDigit, healthScore, isInterState, reverseLines, roundToRupee, totals, validateGstin, validateLines, validatePan, validateTan } from "@/lib/accounting/core";

const L = (ledgerId: string, side: "DR" | "CR", amountPaise: number) => ({ ledgerId, side, amountPaise });

describe("double entry", () => {
  it("accepts a balanced voucher", () => {
    expect(validateLines([L("rent", "DR", 2500000), L("bank", "CR", 2500000)])).toEqual([]);
  });
  it("rejects unbalanced, one-sided, zero and single-line vouchers", () => {
    expect(validateLines([L("a", "DR", 100), L("b", "CR", 99)]).join()).toMatch(/don't match/);
    expect(validateLines([L("a", "DR", 100), L("b", "DR", 100)]).join()).toMatch(/debit and one credit/);
    expect(validateLines([L("a", "DR", 0), L("b", "CR", 0)]).join()).toMatch(/positive/);
    expect(validateLines([L("a", "DR", 100)]).join()).toMatch(/two lines/);
    expect(validateLines([L("a", "DR", 10.5), L("b", "CR", 10.5)]).join()).toMatch(/positive/);
  });
  it("reversal swaps sides and nets to zero", () => {
    const lines = [L("rent", "DR", 100), L("gst", "DR", 18), L("bank", "CR", 118)];
    const rev = reverseLines(lines);
    expect(rev.map((l) => l.side)).toEqual(["CR", "CR", "DR"]);
    const net = (ls: typeof lines) => ls.reduce((t, l) => t + (l.side === "DR" ? l.amountPaise : -l.amountPaise), 0);
    expect(net([...lines, ...rev])).toBe(0);
    expect(totals(rev)).toEqual({ dr: 118, cr: 118 });
  });
});

describe("GST", () => {
  it("splits intra-state into equal CGST and SGST", () => {
    expect(gstSplit(10000000, 18, false)).toEqual({ taxable: 10000000, cgst: 900000, sgst: 900000, igst: 0, tax: 1800000, total: 11800000 });
  });
  it("charges IGST inter-state", () => {
    expect(gstSplit(10000000, 18, true)).toMatchObject({ cgst: 0, sgst: 0, igst: 1800000, total: 11800000 });
  });
  it("rounds each head to the paisa", () => {
    const s = gstSplit(33333, 5, false); // 333.33 @5% → 8.33 each half
    expect(s.cgst).toBe(833);
    expect(s.total).toBe(33333 + 1666);
  });
  it("backs GST out of an inclusive amount exactly", () => {
    const s = gstFromInclusive(11800000, 18, false);
    expect(s.taxable).toBe(10000000);
    expect(s.taxable + s.tax).toBe(11800000);
    const odd = gstFromInclusive(99999, 12, true);
    expect(odd.taxable + odd.igst).toBe(99999);
  });
  it("decides place of supply", () => {
    expect(isInterState("27", "27")).toBe(false);
    expect(isInterState("27", "29")).toBe(true);
    expect(isInterState("27", null)).toBe(false);
  });
  it("rounds documents to the rupee", () => {
    expect(roundToRupee(1234560)).toEqual({ rounded: 1234600, roundOff: 40 });
    expect(roundToRupee(1234540)).toEqual({ rounded: 1234500, roundOff: -40 });
  });
});

describe("identity numbers", () => {
  const first14 = "27AAJCA5678M1Z";
  const good = first14 + gstinCheckDigit(first14);
  it("validates GSTIN format and check digit", () => {
    expect(validateGstin(good).ok).toBe(true);
    expect(validateGstin("27AAPFU0939F1ZV").ok).toBe(true); // published sample GSTIN
    const typo = good.slice(0, 14) + (good[14] === "A" ? "B" : "A");
    expect(validateGstin(typo)).toMatchObject({ ok: false });
    expect(validateGstin("27AAJCA5678M1").ok).toBe(false);
  });
  it("validates PAN and TAN", () => {
    expect(validatePan("AAJCA5678M")).toBe(true);
    expect(validatePan("AAJXA5678M")).toBe(false); // 4th char must be an entity type
    expect(validateTan("PNEA12345B")).toBe(true);
    expect(validateTan("PNE12345B")).toBe(false);
  });
});

describe("ageing & health", () => {
  it("buckets by days past due", () => {
    expect([0, 30, 31, 60, 61, 90, 91, -5].map(bucketFor)).toEqual(["0-30", "0-30", "31-60", "31-60", "61-90", "61-90", "90+", "0-30"]);
    const asOf = new Date("2026-10-10");
    expect(ageing([{ outstandingPaise: 100, dueDate: new Date("2026-06-01") }, { outstandingPaise: 50, dueDate: new Date("2026-10-01") }], asOf)).toEqual({ "0-30": 50, "31-60": 0, "61-90": 0, "90+": 100 });
  });
  it("scores health with capped penalties", () => {
    expect(healthScore({ unreconciledBankLines: 0, unpostedDrafts: 0, overdueFilings: 0, partiesMissingGstin: 0, suspenseBalancePaise: 0 }).score).toBe(100);
    const bad = healthScore({ unreconciledBankLines: 100, unpostedDrafts: 100, overdueFilings: 100, partiesMissingGstin: 100, suspenseBalancePaise: 5 });
    expect(bad.score).toBe(0);
    const some = healthScore({ unreconciledBankLines: 4, unpostedDrafts: 1, overdueFilings: 1, partiesMissingGstin: 1, suspenseBalancePaise: 0 });
    expect(some.score).toBe(100 - 8 - 3 - 10 - 2);
    expect(some.issues[0].key).toBe("filings");
  });
});
