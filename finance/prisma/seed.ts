/**
 * Demo data: AUDIT TEST TRADERS (Pvt Ltd, Maharashtra) with FY 2026-27 activity up to today.
 * Everything is posted through the real services, so balances, GST and TDS reconcile.
 * Run: npm run db:seed   (wipes the database first)
 */
import { PrismaClient } from "@prisma/client";
import { createCompanyWithChart, ensureDueDates } from "../src/lib/company";
import { createBill, createInvoice, createParty, payBill, recordReceipt } from "../src/lib/documents";
import { createAndPost, createDraft } from "../src/lib/accounting/post";
import { gstinCheckDigit } from "../src/lib/accounting/core";
import { resolvePeriod, todayUTC, utc } from "../src/lib/fy";
import type { Ctx } from "../src/lib/session";

const db = new PrismaClient();
const FY = 2026;
const today = todayUTC();
const R = (rupees: number) => Math.round(rupees * 100);
const gstin = (state: string, pan: string) => { const f = `${state}${pan}1Z`; return f + gstinCheckDigit(f); };

// Deterministic pseudo-random so every seed produces identical books.
let seed = 20262027;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const between = (a: number, b: number) => Math.round((a + rnd() * (b - a)) / 10) * 10;

async function wipe() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

async function main() {
  await wipe();
  const owner = await db.user.create({ data: { email: "owner@demo.in", name: "Demo Owner", emailVerified: new Date() } });
  const accountant = await db.user.create({ data: { email: "accountant@demo.in", name: "Demo Accountant", emailVerified: new Date() } });
  const auditor = await db.user.create({ data: { email: "auditor@demo.in", name: "Demo Auditor", emailVerified: new Date() } });

  const company = await createCompanyWithChart(db, owner.id, {
    name: "AUDIT TEST TRADERS", legalType: "PRIVATE_LIMITED", stateCode: "27", gstin: gstin("27", "AAJCA5678M"), pan: "AAJCA5678M", tan: "PNEA12345B",
    address: "Office 402, Example Business Park, Baner, Pune 411045", email: "accounts@audittesttraders.example", phone: "+91 20 0000 0000", upiId: "audittest@hdfcbank", flags: ["pf", "pt"],
  }, "HDFC Bank");
  await db.membership.createMany({ data: [{ userId: accountant.id, companyId: company.id, role: "ACCOUNTANT" }, { userId: auditor.id, companyId: company.id, role: "AUDITOR" }] });
  const ctx: Ctx = { user: { id: owner.id, email: owner.email!, name: owner.name! }, company, role: "OWNER", companies: [], fy: FY, period: resolvePeriod(FY, "fy") };

  const L = async (name: string) => (await db.ledger.findFirstOrThrow({ where: { companyId: company.id, name } })).id;
  const hdfc = await L("HDFC Bank"), cash = await L("Cash");
  const bankGroup = await db.ledgerGroup.findFirstOrThrow({ where: { companyId: company.id, name: "Bank Accounts" } });
  await db.ledger.update({ where: { id: hdfc }, data: { bankAccountNo: "XXXXXXXX4821", ifsc: "HDFC0001234" } });
  await db.ledger.create({ data: { companyId: company.id, groupId: bankGroup.id, name: "ICICI Bank", kind: "BANK", bankAccountNo: "XXXXXXXX9310", ifsc: "ICIC0004321", aliases: ["icici"] } });

  // Opening balances on 1 Apr 2026 (Dr positive). Sum is zero.
  const openings: [string, number][] = [["Capital Account", -R(1000000)], ["Computers & Laptops", R(180000)], ["Furniture & Fixtures", R(95000)], ["HDFC Bank", R(540000)], ["Cash", R(35000)], ["Security Deposits", R(150000)]];
  for (const [name, p] of openings) await db.ledger.update({ where: { id: await L(name) }, data: { openingPaise: BigInt(p) } });

  // Parties
  const cust = [
    await createParty(ctx, { name: "Sahyadri Retail Pvt Ltd", kind: "CUSTOMER", gstin: gstin("27", "AABCS1234Q"), creditDays: 30, email: "accounts@sahyadri.example", phone: "+919800000001" }),
    await createParty(ctx, { name: "Konkan Foods LLP", kind: "CUSTOMER", gstin: gstin("27", "AAKFK4567R"), creditDays: 45, email: "ap@konkanfoods.example", phone: "+919800000002" }),
    await createParty(ctx, { name: "Deccan Hardware Co", kind: "CUSTOMER", gstin: gstin("29", "AAEFD7890S"), creditDays: 30, email: "pay@deccanhw.example", phone: "+919800000003" }),
    await createParty(ctx, { name: "Gujarat Polymers Ltd", kind: "CUSTOMER", gstin: gstin("24", "AACCG2345T"), creditDays: 60, email: "finance@gujpoly.example", phone: "+919800000004" }),
    await createParty(ctx, { name: "Walk-in Customer", kind: "CUSTOMER", stateCode: "27", creditDays: 0 }),
  ];
  const rentV = await createParty(ctx, { name: "Pune Office Spaces", kind: "VENDOR", gstin: gstin("27", "AAHFP3456U"), creditDays: 7, tdsSection: "194I(b)" });
  const statV = await createParty(ctx, { name: "Metro Stationers", kind: "VENDOR", gstin: gstin("27", "ABMPM6789V"), creditDays: 15 });
  const logV = await createParty(ctx, { name: "Bright Logistics", kind: "VENDOR", gstin: gstin("27", "AAGFB1122W"), creditDays: 30, tdsSection: "194C" });
  const caV = await createParty(ctx, { name: "Kulkarni & Associates", kind: "VENDOR", gstin: gstin("27", "AAFFK3344X"), creditDays: 15, tdsSection: "194J" });
  const swV = await createParty(ctx, { name: "Cloudnine Software", kind: "VENDOR", gstin: gstin("29", "AADCC5566Y"), creditDays: 0 });
  const stockV = await createParty(ctx, { name: "Western Plastics Pvt Ltd", kind: "VENDOR", gstin: gstin("27", "AABCW7788Z"), creditDays: 30 });
  await createParty(ctx, { name: "Shree Packaging", kind: "VENDOR", stateCode: "27", creditDays: 30 }); // missing GSTIN → health hint

  const products = [
    { description: "PVC storage containers", hsn: "3924", unit: "Nos", rate: [450, 650], gst: 18, qty: [150, 450] },
    { description: "Industrial adhesive tape", hsn: "3919", unit: "Rolls", rate: [180, 260], gst: 18, qty: [200, 600] },
    { description: "Corrugated boxes", hsn: "4819", unit: "Nos", rate: [35, 60], gst: 12, qty: [1000, 3000] },
    { description: "Packing & handling", hsn: "9985", unit: "Job", rate: [2500, 6000], gst: 18, qty: [1, 1] },
  ];
  const dueInvoices: { id: string; partyId: string; total: number; due: Date }[] = [];
  const add = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);

  for (let mi = 0; mi < 7; mi++) {
    const y = mi < 9 ? FY : FY + 1, m = 3 + mi;
    const monthEnd = utc(y, m + 1, 0);
    if (utc(y, m, 1) > today) break;
    const day = (dd: number) => { const d = utc(y, m, Math.min(dd, monthEnd.getUTCDate())); return d > today ? null : d; };

    // Sales: 2–3 invoices a month
    for (const dd of [6, 11, 17, 24]) {
      const d = day(dd); if (!d) continue;
      const party = pick(cust);
      const items = [pick(products), pick(products)].filter((p, i, a) => a.indexOf(p) === i).map((p) => ({
        description: p.description, hsn: p.hsn, unit: p.unit, gstRate: p.gst,
        qty: p.unit === "Job" ? 1 : between(p.qty[0], p.qty[1]), ratePaise: R(between(p.rate[0], p.rate[1])),
      }));
      const inv = await createInvoice(ctx, { partyId: party.id, date: d, items });
      dueInvoices.push({ id: inv.id, partyId: party.id, total: Number(inv.totalPaise), due: inv.dueDate });
    }
    // Stock purchases (~55% of sales) on the 3rd, paid within credit terms
    const d3 = day(3);
    if (d3) { const b = await createBill(ctx, { partyId: stockV.id, vendorBillNo: `WP/${y}/${410 + mi}`, date: d3, expenseLedgerId: await L("Purchases"), description: "PVC containers, tape & boxes — stock", hsn: "3924", taxablePaise: R(between(240000, 320000)), gstRate: 18 });
      const pd = add(d3, 28); if (pd <= today) await payBill(ctx, { billId: b.id, amountPaise: Number(b.payablePaise), date: pd, bankLedgerId: hdfc }); }
    // Expenses
    const d1 = day(2), d5 = day(5), d12 = day(12), d18 = day(18), d28 = day(28);
    if (d1) { const b = await createBill(ctx, { partyId: rentV.id, vendorBillNo: `RENT/${y}-${m + 1}`, date: d1, expenseLedgerId: await L("Rent"), description: "Office rent", hsn: "997212", taxablePaise: R(50000), gstRate: 18, tdsSection: "194I(b)" });
      const pd = add(d1, 4); if (pd <= today) await payBill(ctx, { billId: b.id, amountPaise: Number(b.payablePaise), date: pd, bankLedgerId: hdfc }); }
    if (d5) { const b = await createBill(ctx, { partyId: logV.id, vendorBillNo: `BL-${300 + mi}`, date: d5, expenseLedgerId: await L("Freight Inward"), description: "Freight & delivery", hsn: "996511", taxablePaise: R(between(28000, 42000)), gstRate: 12, tdsSection: "194C" });
      const pd = add(d5, 25); if (pd <= today && mi < 5) await payBill(ctx, { billId: b.id, amountPaise: Number(b.payablePaise), date: pd, bankLedgerId: hdfc }); }
    if (d12) { const b = await createBill(ctx, { partyId: statV.id, vendorBillNo: `MS/${1200 + mi * 7}`, date: d12, expenseLedgerId: await L("Printing & Stationery"), description: "Stationery & toner", hsn: "4820", taxablePaise: R(between(1800, 5200)), gstRate: 18 });
      const pd = add(d12, 10); if (pd <= today) await payBill(ctx, { billId: b.id, amountPaise: Number(b.payablePaise), date: pd, bankLedgerId: hdfc }); }
    if (d18) { const b = await createBill(ctx, { partyId: swV.id, vendorBillNo: `CN-${8800 + mi}`, date: d18, expenseLedgerId: await L("Software Subscriptions"), description: "Accounting & CRM licences", hsn: "997331", taxablePaise: R(8400), gstRate: 18 });
      await payBill(ctx, { billId: b.id, amountPaise: Number(b.payablePaise), date: d18, bankLedgerId: hdfc }); }
    if (d28 && mi % 3 === 2) await createBill(ctx, { partyId: caV.id, vendorBillNo: `KA/${y}/${mi}`, date: d28, expenseLedgerId: await L("Professional Fees"), description: "Quarterly accounting & compliance", hsn: "998222", taxablePaise: R(60000), gstRate: 18, tdsSection: "194J" });
    // Salaries on the last day, electricity mid-month (paid straight from bank)
    if (d28) await createAndPost(ctx, { type: "PAYMENT", date: d28, source: "SEED", narration: `Salaries for ${d28.toLocaleString("en-IN", { month: "long", timeZone: "UTC" })}`, lines: [{ ledgerId: await L("Salaries & Wages"), side: "DR", amountPaise: R(120000) }, { ledgerId: hdfc, side: "CR", amountPaise: R(120000) }] });
    const d15 = day(15);
    if (d15) await createAndPost(ctx, { type: "PAYMENT", date: d15, source: "SEED", narration: "Electricity bill — MSEDCL", lines: [{ ledgerId: await L("Electricity"), side: "DR", amountPaise: R(between(3800, 6200)) }, { ledgerId: hdfc, side: "CR", amountPaise: 0 }].map((l, _i, a) => (l.amountPaise ? l : { ...l, amountPaise: a[0].amountPaise })) });
    const d20 = day(20);
    if (d20 && mi % 2 === 0) await createAndPost(ctx, { type: "PAYMENT", date: d20, source: "SEED", narration: "Petty cash — tea, courier, conveyance", lines: [{ ledgerId: await L("Office Expenses"), side: "DR", amountPaise: R(between(900, 2400)) }, { ledgerId: cash, side: "CR", amountPaise: 0 }].map((l, _i, a) => (l.amountPaise ? l : { ...l, amountPaise: a[0].amountPaise })) });
  }

  // Customer receipts: settle invoices due more than ~10 days ago, leaving a realistic ageing spread.
  for (const [i, inv] of dueInvoices.entries()) {
    const payOn = add(inv.due, -5 + (i % 4) * 4);
    const ageDays = (today.getTime() - inv.due.getTime()) / 86400000;
    if (payOn > today || (i % 5 === 3 && ageDays > 20)) continue; // some stay unpaid → overdue buckets
    await recordReceipt(ctx, { partyId: inv.partyId, invoiceId: inv.id, amountPaise: i % 6 === 2 ? Math.round(inv.total / 2) : inv.total, date: payOn, bankLedgerId: hdfc });
  }

  // Monthly TDS deposit (7th) and GST settlement (20th) for completed months.
  const tdsLedger = await L("TDS Payable");
  const heads = Object.fromEntries(await Promise.all(["CGST_OUT", "SGST_OUT", "IGST_OUT", "CGST_IN", "SGST_IN", "IGST_IN"].map(async (h) => [h, (await db.ledger.findFirstOrThrow({ where: { companyId: company.id, taxHead: h } })).id])));
  for (let mi = 0; mi < 6; mi++) {
    const y = FY, m = 3 + mi;
    const from = utc(y, m, 1), to = utc(y, m + 1, 0);
    const tdsDue = utc(y, m + 1, 7), gstDue = utc(y, m + 1, 20);
    if (tdsDue <= today) {
      const agg = await db.voucherLine.aggregate({ _sum: { amountPaise: true }, where: { ledgerId: tdsLedger, side: "CR", voucher: { companyId: company.id, date: { gte: from, lte: to } } } });
      const amt = Number(agg._sum.amountPaise ?? 0);
      if (amt) await createAndPost(ctx, { type: "PAYMENT", date: add(tdsDue, -1), source: "SEED", narration: `TDS deposit for ${from.toLocaleString("en-IN", { month: "short", timeZone: "UTC" })} — challan 281`, lines: [{ ledgerId: tdsLedger, side: "DR", amountPaise: amt }, { ledgerId: hdfc, side: "CR", amountPaise: amt }] });
    }
    if (gstDue <= today) {
      const sums: Record<string, number> = {};
      for (const [h, id] of Object.entries(heads)) {
        const a = await db.voucherLine.groupBy({ by: ["side"], _sum: { amountPaise: true }, where: { ledgerId: id, voucher: { companyId: company.id, type: { in: ["SALES", "PURCHASE"] }, date: { gte: from, lte: to } } } });
        sums[h] = a.reduce((t, x) => t + (x.side === "DR" ? 1 : -1) * Number(x._sum.amountPaise ?? 0), 0);
      }
      const out = -(sums.CGST_OUT + sums.SGST_OUT + sums.IGST_OUT), inp = sums.CGST_IN + sums.SGST_IN + sums.IGST_IN;
      if (out > inp) {
        const lines = [
          ...["CGST_OUT", "SGST_OUT", "IGST_OUT"].filter((h) => sums[h]).map((h) => ({ ledgerId: heads[h], side: "DR" as const, amountPaise: -sums[h] })),
          ...["CGST_IN", "SGST_IN", "IGST_IN"].filter((h) => sums[h]).map((h) => ({ ledgerId: heads[h], side: "CR" as const, amountPaise: sums[h] })),
          { ledgerId: hdfc, side: "CR" as const, amountPaise: out - inp },
        ];
        await createAndPost(ctx, { type: "PAYMENT", date: add(gstDue, -2), source: "SEED", narration: `GST for ${from.toLocaleString("en-IN", { month: "short", timeZone: "UTC" })}: ITC set-off and cash payment (PMT-06)`, lines });
      }
    }
  }

  // Today's chat entries: one posted, one draft waiting for confirmation.
  await createAndPost(ctx, { type: "PAYMENT", date: today, source: "CHAT", aiInput: "Paid internet bill 2,360 from HDFC", aiConfidence: 0.93, narration: "Internet bill — Jio Fiber", lines: [{ ledgerId: await L("Telephone & Internet"), side: "DR", amountPaise: R(2360) }, { ledgerId: hdfc, side: "CR", amountPaise: R(2360) }] });
  await createDraft(ctx, { type: "PAYMENT", date: today, source: "CHAT", aiInput: "Bought stationery ₹1,800 in cash", aiConfidence: 0.88, narration: "Stationery purchased in cash", lines: [{ ledgerId: await L("Printing & Stationery"), side: "DR", amountPaise: R(1800) }, { ledgerId: cash, side: "CR", amountPaise: R(1800) }] });

  // Bank statement: last ~45 days of HDFC lines; most match posted vouchers, a few don't.
  const since = add(today, -45);
  const bankLines = await db.voucherLine.findMany({ where: { ledgerId: hdfc, voucher: { companyId: company.id, status: "POSTED", date: { gte: since, lt: today } } }, include: { voucher: { include: { party: true } } }, orderBy: { voucher: { date: "asc" } } });
  const batch = "seed-hdfc";
  for (const l of bankLines) {
    const amt = Number(l.amountPaise) * (l.side === "DR" ? 1 : -1);
    await db.bankTxn.create({ data: { companyId: company.id, ledgerId: hdfc, date: l.voucher.date, description: (l.voucher.party?.name ?? l.voucher.narration ?? "Transfer").toUpperCase().slice(0, 60), reference: `UTR${String(l.voucher.number).replace(/\D/g, "").slice(-8)}`, amountPaise: BigInt(amt), status: "MATCHED", voucherId: l.voucher.id, importBatch: batch } });
  }
  for (const [days, desc, amt] of [[-9, "SMS CHARGES QTR + GST", -R(236)], [-6, "INT.PD SAVINGS", R(1240)], [-3, "UPI/CR/KONKANFOODS/PART PMT", R(15000)], [-2, "NEFT DR AMAZON SELLER SVCS", -R(3540)]] as const) {
    await db.bankTxn.create({ data: { companyId: company.id, ledgerId: hdfc, date: add(today, days), description: desc, amountPaise: BigInt(amt), status: "UNMATCHED", importBatch: batch } });
  }

  // Compliance: generate FY due dates, mark everything already past as filed except PT for September.
  await ensureDueDates(db, company.id, FY);
  await db.dueDate.updateMany({ where: { companyId: company.id, dueOn: { lt: today }, NOT: { code: "PROF_TAX", period: `${FY}-09` } }, data: { status: "FILED", filedAt: today } });

  // A second, smaller client company so the firm view has something to compare.
  const second = await createCompanyWithChart(db, owner.id, { name: "SHREE GANESH ENTERPRISES", legalType: "PROPRIETORSHIP", stateCode: "27", gstin: gstin("27", "ABCPG1234H"), pan: "ABCPG1234H" }, "SBI Current A/c");
  await ensureDueDates(db, second.id, FY);
  await db.dueDate.updateMany({ where: { companyId: second.id, dueOn: { lt: today } }, data: { status: "FILED", filedAt: today } });

  const counts = await Promise.all([db.voucher.count(), db.invoice.count(), db.bill.count(), db.bankTxn.count()]);
  console.log(`Seeded AUDIT TEST TRADERS: ${counts[0]} vouchers, ${counts[1]} invoices, ${counts[2]} bills, ${counts[3]} bank lines. Sign in as owner@demo.in`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
