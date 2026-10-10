import { describe, expect, it } from "vitest";
import { findAmount, findDate, ruleDraft } from "@/lib/ai/rules";
import type { ChartContext } from "@/lib/ai/schema";

const chart: ChartContext = {
  today: "2026-10-10", companyName: "Test", stateCode: "27", gstRegistered: true,
  ledgers: [
    { id: "hdfc", name: "HDFC Bank", group: "Bank Accounts", kind: "BANK", aliases: ["hdfc", "bank"] },
    { id: "cash", name: "Cash", group: "Cash-in-Hand", kind: "CASH", aliases: ["cash"] },
    { id: "rent", name: "Rent", group: "Indirect Expenses", kind: "GENERAL", aliases: ["rent", "office rent"] },
    { id: "stat", name: "Printing & Stationery", group: "Indirect Expenses", kind: "GENERAL", aliases: ["stationery"] },
    { id: "sal", name: "Salaries & Wages", group: "Employee Costs", kind: "GENERAL", aliases: ["salary", "salaries"] },
    { id: "tel", name: "Telephone & Internet", group: "Indirect Expenses", kind: "GENERAL", aliases: ["internet"] },
    { id: "sales", name: "Sales", group: "Sales Accounts", kind: "GENERAL", aliases: ["sales"] },
    { id: "susp", name: "Suspense", group: "Suspense A/c", kind: "SUSPENSE", aliases: [] },
    { id: "sahl", name: "Sahyadri Retail Pvt Ltd", group: "Sundry Debtors", kind: "PARTY", aliases: [] },
  ],
  parties: [{ id: "sah", name: "Sahyadri Retail Pvt Ltd", kind: "CUSTOMER", ledgerId: "sahl", tdsSection: null }],
  hints: [{ keyword: "jio", ledgerId: "tel" }],
};

describe("amount & date extraction", () => {
  it("reads Indian amount styles", () => {
    expect(findAmount("Paid office rent ₹25,000 from HDFC")).toBe(2500000);
    expect(findAmount("Received ₹1.2L from a customer")).toBe(12000000);
    expect(findAmount("spent 25k on ads")).toBe(2500000);
    expect(findAmount("Rs. 1,800 cash")).toBe(180000);
  });
  it("ignores years", () => {
    expect(findAmount("Paid rent for October 2026 of 30,000")).toBe(3000000);
  });
  it("resolves dates", () => {
    expect(findDate("paid yesterday", "2026-10-10")).toBe("2026-10-09");
    expect(findDate("on 5th Oct", "2026-10-10")).toBe("2026-10-05");
    expect(findDate("on 20 Dec", "2026-10-10")).toBe("2025-12-20");
    expect(findDate("today", "2026-10-10")).toBe("2026-10-10");
  });
});

describe("rule-based drafter", () => {
  it("rent paid from bank → payment Dr Rent Cr HDFC", () => {
    const d = ruleDraft("Paid office rent ₹25,000 from HDFC Bank for October", chart);
    expect(d.voucherType).toBe("PAYMENT");
    expect(d.lines).toEqual([{ ledger: "Rent", side: "DR", amount: 25000 }, { ledger: "HDFC Bank", side: "CR", amount: 25000 }]);
    expect(d.confidence).toBeGreaterThanOrEqual(0.75);
  });
  it("cash purchase uses the Cash ledger", () => {
    const d = ruleDraft("Bought stationery ₹1,800 in cash", chart);
    expect(d.lines[1].ledger).toBe("Cash");
    expect(d.lines[0].ledger).toBe("Printing & Stationery");
  });
  it("receipt from a named customer credits their account", () => {
    const d = ruleDraft("Received 50,000 from Sahyadri into HDFC", chart);
    expect(d.voucherType).toBe("RECEIPT");
    expect(d.lines).toEqual([{ ledger: "HDFC Bank", side: "DR", amount: 50000 }, { ledger: "Sahyadri Retail Pvt Ltd", side: "CR", amount: 50000 }]);
  });
  it("unknown customer → asks which one", () => {
    const d = ruleDraft("Received ₹1.2L from a customer", chart);
    expect(d.question).toMatch(/customer/i);
    expect(d.confidence).toBeLessThan(0.6);
  });
  it("learned hints beat aliases", () => {
    const d = ruleDraft("Paid jio bill 2,360 from hdfc", chart);
    expect(d.lines[0].ledger).toBe("Telephone & Internet");
    expect(d.confidence).toBeGreaterThan(0.85);
  });
  it("cash deposited in bank → contra", () => {
    const d = ruleDraft("Deposited cash 40,000 into HDFC", chart);
    expect(d.voucherType).toBe("CONTRA");
    expect(d.lines[0]).toMatchObject({ ledger: "HDFC Bank", side: "DR" });
  });
  it("no amount → asks how much", () => {
    expect(ruleDraft("Paid the plumber from HDFC", chart).question).toMatch(/how much/i);
  });
});
