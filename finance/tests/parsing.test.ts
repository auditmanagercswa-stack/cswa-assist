import { describe, expect, it } from "vitest";
import { matchScore, parseDate, parseMoney, parseTable } from "@/lib/bank/parse";
import { buildTallyXml, parseTallyXml } from "@/lib/sync/tally-xml";
import { periodFromText } from "@/lib/ai/period-words";
import { fyLabel, fyStartYear, resolvePeriod, utc } from "@/lib/fy";
import { inr, inrCompact, parseAmount, fmtDate, mask } from "@/lib/format";
import { rupeesInWords } from "@/lib/words";

describe("bank statements", () => {
  it("parses common date formats", () => {
    expect(parseDate("05/10/26")).toBe("2026-10-05");
    expect(parseDate("05-10-2026")).toBe("2026-10-05");
    expect(parseDate("5 Oct 2026")).toBe("2026-10-05");
    expect(parseDate("2026-10-05")).toBe("2026-10-05");
    expect(parseDate("31/02/2026")).toBeNull();
  });
  it("parses money", () => {
    expect(parseMoney("1,23,456.78")).toBe(12345678);
    expect(parseMoney("(500.00)")).toBe(-50000);
    expect(parseMoney("")).toBeNull();
  });
  it("reads an HDFC-style statement with preamble rows", () => {
    const t = [["HDFC BANK"], ["Statement"], ["Date", "Narration", "Chq./Ref.No.", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"],
      ["05/10/26", "NEFT CR SAHYADRI", "N1", "", "50,000.00", "3,91,918.90"], ["07/10/26", "ACH DR MSEDCL", "A9", "4,120.00", "", "3,87,798.90"], ["", "", "", "", "", ""]];
    const r = parseTable(t);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: "2026-10-05", amountPaise: 5000000, reference: "N1", balancePaise: 39191890 });
    expect(r.rows[1].amountPaise).toBe(-412000);
    expect(r.skipped).toBe(1);
  });
  it("reads an Amount + Dr/Cr statement", () => {
    const r = parseTable([["Txn Date", "Description", "Amount", "Dr/Cr"], ["2026-10-01", "RENT", "50000", "DR"], ["2026-10-02", "INT", "1240", "CR"]]);
    expect(r.rows.map((x) => x.amountPaise)).toEqual([-5000000, 124000]);
  });
  it("explains a file it can't read", () => {
    expect(parseTable([["foo", "bar"]]).error).toMatch(/Couldn't find/);
  });
  it("scores matches by amount, date and words", () => {
    const tx = { date: "2026-10-05", amountPaise: 5000000, description: "NEFT CR SAHYADRI RETAIL" };
    expect(matchScore(tx, { date: "2026-10-05", amountPaise: 4999900, words: "" })).toBe(0);
    expect(matchScore(tx, { date: "2026-10-20", amountPaise: 5000000, words: "" })).toBe(0);
    expect(matchScore(tx, { date: "2026-10-04", amountPaise: 5000000, words: "Sahyadri Retail Pvt Ltd" })).toBeGreaterThan(matchScore(tx, { date: "2026-10-04", amountPaise: 5000000, words: "Other" }));
  });
});

describe("Tally XML", () => {
  it("round-trips masters and vouchers with Tally's sign convention", () => {
    const xml = buildTallyXml("Demo & Co", {
      groups: [{ name: "Sundry Debtors", parent: "Current Assets" }],
      ledgers: [{ name: "Cash", parent: "Cash-in-Hand", openingPaise: 3500000 }, { name: "Capital Account", parent: "Capital Account", openingPaise: -3500000 }],
      vouchers: [{ type: "PAYMENT", date: "2026-10-01", number: "PMT/26-27/0001", narration: "Rent <Oct>", party: null, lines: [{ ledger: "Rent", side: "DR", amountPaise: 2500000 }, { ledger: "HDFC Bank", side: "CR", amountPaise: 2500000 }] }],
    });
    expect(xml).toContain("<AMOUNT>-25000.00</AMOUNT>");
    expect(xml).toContain("<OPENINGBALANCE>-35000.00</OPENINGBALANCE>");
    expect(xml).toContain("Rent &lt;Oct&gt;");
    const p = parseTallyXml(xml);
    expect(p.groups).toEqual([{ name: "Sundry Debtors", parent: "Current Assets" }]);
    expect(p.ledgers.find((l) => l.name === "Cash")!.openingPaise).toBe(3500000);
    expect(p.vouchers[0]).toMatchObject({ type: "PAYMENT", date: "2026-10-01", number: "PMT/26-27/0001", narration: "Rent <Oct>" });
    expect(p.vouchers[0].lines).toEqual([{ ledger: "Rent", side: "DR", amountPaise: 2500000 }, { ledger: "HDFC Bank", side: "CR", amountPaise: 2500000 }]);
  });
});

describe("periods & formatting", () => {
  it("financial year helpers", () => {
    expect(fyStartYear(utc(2027, 1, 10))).toBe(2026);
    expect(fyStartYear(utc(2026, 3, 1))).toBe(2026);
    expect(fyLabel(2026)).toBe("FY 2026-27");
    expect(resolvePeriod(2026, "q3")).toMatchObject({ from: utc(2026, 9, 1), to: utc(2026, 11, 31) });
    expect(resolvePeriod(2026, "q4").to).toEqual(utc(2027, 2, 31));
    expect(resolvePeriod(2026, "m-2027-02").to).toEqual(utc(2027, 1, 28));
    expect(resolvePeriod(2026, "c-2026-05-01-2026-04-01").key).toBe("fy"); // reversed custom range falls back
  });
  it("understands period words", () => {
    const today = utc(2026, 9, 10), fb = { from: utc(2026, 3, 1), to: utc(2027, 2, 31), label: "fy" };
    expect(periodFromText("rent this quarter", today, fb)).toMatchObject({ from: utc(2026, 9, 1) });
    expect(periodFromText("last month", today, fb)).toMatchObject({ from: utc(2026, 8, 1), to: utc(2026, 8, 30) });
    expect(periodFromText("in august", today, fb).from).toEqual(utc(2026, 7, 1));
    expect(periodFromText("in december", today, fb).from).toEqual(utc(2025, 11, 1));
  });
  it("formats rupees the Indian way", () => {
    expect(inr(13000000)).toBe("₹1,30,000");
    expect(inr(7500050)).toBe("₹75,000.50");
    expect(inr(-2500000)).toBe("−₹25,000");
    expect(inrCompact(12000000)).toBe("₹1.2L");
    expect(inrCompact(345000000)).toBe("₹34.5L");
    expect(inrCompact(3450000000)).toBe("₹3.5Cr");
    expect(parseAmount("1.2L")).toBe(12000000);
    expect(fmtDate(utc(2026, 9, 5))).toBe("05 Oct 2026");
    expect(mask("ABCDE1234F")).toBe("••••••234F");
  });
  it("writes amounts in Indian words", () => {
    expect(rupeesInWords(12500050)).toBe("Rupees One Lakh Twenty Five Thousand and Fifty Paise Only");
    expect(rupeesInWords(1000000000)).toBe("Rupees One Crore Only");
  });
});
