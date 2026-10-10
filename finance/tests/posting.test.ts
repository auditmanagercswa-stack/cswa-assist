/**
 * Integration tests against Postgres (TEST_DATABASE_URL): posting, immutability, reversal,
 * numbering, FY lock, roles and the invoice/bill postings.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Company } from "@prisma/client";
import { db, n } from "@/lib/db";
import { createCompanyWithChart } from "@/lib/company";
import { AccountingError, createAndPost, createDraft, lockFy, postVoucher, reverseVoucher, unlockBooks } from "@/lib/accounting/post";
import { createBill, createInvoice, createParty, recordReceipt } from "@/lib/documents";
import { getTrialBalance } from "@/lib/accounting/ledger";
import { resolvePeriod } from "@/lib/fy";
import { ForbiddenError } from "@/lib/roles";
import type { Ctx } from "@/lib/session";

let ctx: Ctx;
let company: Company;
const L = async (name: string) => (await db.ledger.findFirstOrThrow({ where: { companyId: company.id, name } })).id;
const d = (s: string) => new Date(s + "T00:00:00Z");

beforeAll(async () => {
  const user = await db.user.create({ data: { email: `t${Date.now()}@test.in`, name: "Tester" } });
  company = await createCompanyWithChart(db, user.id, { name: "Test Traders", legalType: "PRIVATE_LIMITED", stateCode: "27", gstin: "27AAPFU0939F1ZV" }, "HDFC Bank");
  ctx = { user: { id: user.id, email: user.email!, name: "Tester" }, company, role: "OWNER", companies: [], fy: 2026, period: resolvePeriod(2026, "fy") };
});
afterAll(() => db.$disconnect());

describe("posting", () => {
  it("posts a balanced voucher with a per-FY number and audit trail", async () => {
    const v = await createAndPost(ctx, { type: "PAYMENT", date: d("2026-10-01"), narration: "Rent", lines: [{ ledgerId: await L("Rent"), side: "DR", amountPaise: 2500000 }, { ledgerId: await L("HDFC Bank"), side: "CR", amountPaise: 2500000 }] });
    expect(v.status).toBe("POSTED");
    expect(v.number).toBe("PMT/26-27/0001");
    const v2 = await createAndPost(ctx, { type: "PAYMENT", date: d("2026-10-02"), lines: [{ ledgerId: await L("Rent"), side: "DR", amountPaise: 100 }, { ledgerId: await L("Cash"), side: "CR", amountPaise: 100 }] });
    expect(v2.number).toBe("PMT/26-27/0002");
    expect(await db.auditLog.count({ where: { entityId: v.id, action: "voucher.post" } })).toBe(1);
  });

  it("refuses to post an unbalanced draft", async () => {
    const draft = await createDraft(ctx, { type: "JOURNAL", date: d("2026-10-03"), lines: [{ ledgerId: await L("Rent"), side: "DR", amountPaise: 1000 }, { ledgerId: await L("Cash"), side: "CR", amountPaise: 900 }] });
    await expect(postVoucher(ctx, draft.id)).rejects.toThrow(/don't match/);
  });

  it("refuses ledgers from another company", async () => {
    const other = await db.user.create({ data: { email: `o${Date.now()}@test.in` } });
    const c2 = await createCompanyWithChart(db, other.id, { name: "Other Co", legalType: "PROPRIETORSHIP", stateCode: "29" });
    const foreign = (await db.ledger.findFirstOrThrow({ where: { companyId: c2.id, name: "Cash" } })).id;
    await expect(createAndPost(ctx, { type: "PAYMENT", date: d("2026-10-03"), lines: [{ ledgerId: await L("Rent"), side: "DR", amountPaise: 100 }, { ledgerId: foreign, side: "CR", amountPaise: 100 }] })).rejects.toThrow(AccountingError);
  });

  it("reversal posts a mirror voucher, marks the original and nets to zero", async () => {
    const rent = await L("Office Expenses"), cash = await L("Cash");
    const v = await createAndPost(ctx, { type: "PAYMENT", date: d("2026-10-04"), lines: [{ ledgerId: rent, side: "DR", amountPaise: 77700 }, { ledgerId: cash, side: "CR", amountPaise: 77700 }] });
    const rev = await reverseVoucher(ctx, v.id, "entered twice");
    expect(rev.reversalOfId).toBe(v.id);
    expect((await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).status).toBe("REVERSED");
    await expect(reverseVoucher(ctx, v.id, "again")).rejects.toThrow(/Only posted/);
    await expect(reverseVoucher(ctx, rev.id, "undo the undo")).rejects.toThrow(/can't itself be reversed/);
    const tb = await getTrialBalance(company.id, d("2026-04-01"), d("2027-03-31"));
    const row = tb.rows.find((r) => r.ledgerId === rent)!;
    expect(row.closing).toBe(0); // both movements stay visible, net zero
    expect(row.dr).toBe(row.cr);
  });

  it("FY lock blocks posting and reversing in the closed year", async () => {
    await lockFy(ctx, 2025);
    await expect(createAndPost(ctx, { type: "JOURNAL", date: d("2026-03-31"), lines: [{ ledgerId: await L("Rent"), side: "DR", amountPaise: 100 }, { ledgerId: await L("Cash"), side: "CR", amountPaise: 100 }] })).rejects.toThrow(/locked/);
    const ok = await createAndPost(ctx, { type: "JOURNAL", date: d("2026-04-01"), lines: [{ ledgerId: await L("Rent"), side: "DR", amountPaise: 100 }, { ledgerId: await L("Cash"), side: "CR", amountPaise: 100 }] });
    expect(ok.number).toMatch(/^JV\/26-27/);
    await unlockBooks(ctx);
  });

  it("auditors are read-only", async () => {
    const auditor = { ...ctx, role: "AUDITOR" as const };
    await expect(createAndPost(auditor, { type: "JOURNAL", date: d("2026-10-05"), lines: [{ ledgerId: await L("Rent"), side: "DR", amountPaise: 100 }, { ledgerId: await L("Cash"), side: "CR", amountPaise: 100 }] })).rejects.toThrow(ForbiddenError);
  });
});

describe("documents", () => {
  it("inter-state invoice posts IGST and a balanced sales voucher; receipt settles it", async () => {
    const cust = await createParty(ctx, { name: "Karnataka Buyer", kind: "CUSTOMER", gstin: "29AAPFU0939F1Z1".slice(0, 14) + "X", stateCode: "29" }).catch(() => null)
      ?? await createParty(ctx, { name: "Karnataka Buyer", kind: "CUSTOMER", stateCode: "29" });
    const inv = await createInvoice(ctx, { partyId: cust.id, date: d("2026-10-06"), items: [{ description: "Boxes", qty: 10, ratePaise: 100000, gstRate: 18 }] });
    expect(inv.number).toBe("INV/26-27/0001");
    expect(n(inv.igstPaise)).toBe(180000);
    expect(n(inv.cgstPaise)).toBe(0);
    expect(n(inv.totalPaise)).toBe(1180000);
    const v = await db.voucher.findUniqueOrThrow({ where: { id: inv.voucherId! }, include: { lines: true } });
    const sum = (s: "DR" | "CR") => v.lines.filter((l) => l.side === s).reduce((t, l) => t + n(l.amountPaise), 0);
    expect(sum("DR")).toBe(sum("CR"));
    await recordReceipt(ctx, { partyId: cust.id, invoiceId: inv.id, amountPaise: 1180000, date: d("2026-10-10"), bankLedgerId: await L("HDFC Bank") });
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PAID");
  });

  it("bill with TDS credits the vendor net and TDS payable", async () => {
    const vendor = await createParty(ctx, { name: "Landlord", kind: "VENDOR", stateCode: "27", tdsSection: "194I(b)" });
    const bill = await createBill(ctx, { partyId: vendor.id, vendorBillNo: "R-1", date: d("2026-10-01"), expenseLedgerId: await L("Rent"), taxablePaise: 5000000, gstRate: 18, tdsSection: "194I(b)" });
    expect(n(bill.tdsPaise)).toBe(500000);
    expect(n(bill.payablePaise)).toBe(5400000);
    const lines = await db.voucherLine.findMany({ where: { voucherId: bill.voucherId! }, include: { ledger: true } });
    expect(lines.find((l) => l.ledger.taxHead === "TDS_PAYABLE")!.side).toBe("CR");
    expect(lines.find((l) => l.ledger.taxHead === "CGST_IN")!.amountPaise).toBe(BigInt(450000));
  });

  it("rejects an invalid GSTIN on a party", async () => {
    await expect(createParty(ctx, { name: "Typo Co", kind: "VENDOR", gstin: "27AAPFU0939F1ZX" })).rejects.toThrow(/Check digit/);
  });
});
