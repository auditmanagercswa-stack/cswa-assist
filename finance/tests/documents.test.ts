import { describe, expect, it } from "vitest";
import { computeBill, computeInvoice, suggestTds } from "@/lib/doc-math";

describe("invoice maths", () => {
  const items = [{ description: "Containers", qty: 120, ratePaise: 54000, gstRate: 18 }, { description: "Tape", qty: 3, ratePaise: 33333, gstRate: 12 }];
  it("intra-state: CGST + SGST and round-off to the rupee", () => {
    const c = computeInvoice("27", "27", items);
    expect(c.interState).toBe(false);
    expect(c.taxable).toBe(6480000 + 99999);
    expect(c.cgst).toBe(c.sgst);
    expect(c.igst).toBe(0);
    expect(c.total % 100).toBe(0);
    expect(c.taxable + c.cgst + c.sgst + c.roundOff).toBe(c.total);
  });
  it("inter-state: IGST only", () => {
    const c = computeInvoice("27", "29", items);
    expect(c.interState).toBe(true);
    expect(c.cgst + c.sgst).toBe(0);
    expect(c.igst).toBe(Math.round(6480000 * 0.18) + Math.round(99999 * 0.12));
  });
});

describe("bill maths", () => {
  it("deducts TDS from the amount payable to the vendor", () => {
    const b = computeBill("27", "27", { taxablePaise: 5000000, gstRate: 18, tdsSection: "194I(b)" });
    expect(b.total).toBe(5900000);
    expect(b.tds).toBe(500000);
    expect(b.payable).toBe(5400000);
  });
  it("reverse charge: vendor isn't paid the GST", () => {
    const b = computeBill("27", "27", { taxablePaise: 1000000, gstRate: 5, reverseCharge: true });
    expect(b.total).toBe(1000000);
    expect(b.tax).toBe(50000);
  });
  it("suggests TDS and flags amounts under the threshold", () => {
    expect(suggestTds("194C", 2000000)).toMatchObject({ rate: 2, amountPaise: 40000, belowThreshold: true });
    expect(suggestTds("194J", 6000000)).toMatchObject({ rate: 10, amountPaise: 600000, belowThreshold: false });
    expect(suggestTds(null, 100)).toBeNull();
  });
});
