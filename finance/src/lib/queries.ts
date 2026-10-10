import "server-only";
import { db, n } from "@/lib/db";
import { todayUTC, daysBetween } from "@/lib/fy";
import { AGEING_BUCKETS, bucketFor, type Bucket } from "@/lib/accounting/core";

/** Unpaid sales invoices with ageing, grouped by customer. */
export async function receivables(companyId: string) {
  const today = todayUTC();
  const inv = await db.invoice.findMany({ where: { companyId, status: { in: ["ISSUED", "PARTIAL"] } }, include: { party: true }, orderBy: { dueDate: "asc" } });
  const rows = inv.map((i) => {
    const outstanding = n(i.totalPaise) - n(i.paidPaise);
    const overdue = daysBetween(i.dueDate, today);
    return { id: i.id, number: i.number, date: i.date, dueDate: i.dueDate, party: i.party, total: n(i.totalPaise), outstanding, overdue, bucket: bucketFor(overdue) as Bucket };
  }).filter((r) => r.outstanding > 0);
  return { rows, ...group(rows) };
}

/** Unpaid purchase bills with ageing, grouped by vendor. */
export async function payables(companyId: string) {
  const today = todayUTC();
  const bills = await db.bill.findMany({ where: { companyId, status: { in: ["ISSUED", "PARTIAL"] } }, include: { party: true }, orderBy: { dueDate: "asc" } });
  const rows = bills.map((b) => {
    const outstanding = n(b.payablePaise) - n(b.paidPaise);
    const overdue = daysBetween(b.dueDate, today);
    return { id: b.id, number: b.vendorBillNo, date: b.date, dueDate: b.dueDate, party: b.party, total: n(b.payablePaise), outstanding, overdue, bucket: bucketFor(overdue) as Bucket, scheduledOn: b.scheduledOn, tds: n(b.tdsPaise) };
  }).filter((r) => r.outstanding > 0);
  return { rows, ...group(rows) };
}

function group<T extends { party: { id: string; name: string }; outstanding: number; bucket: Bucket }>(rows: T[]) {
  const buckets = Object.fromEntries(AGEING_BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  const by = new Map<string, { id: string; name: string; total: number; buckets: Record<Bucket, number>; count: number }>();
  for (const r of rows) {
    buckets[r.bucket] += r.outstanding;
    const p = by.get(r.party.id) ?? { id: r.party.id, name: r.party.name, total: 0, count: 0, buckets: Object.fromEntries(AGEING_BUCKETS.map((b) => [b, 0])) as Record<Bucket, number> };
    p.total += r.outstanding; p.count++; p.buckets[r.bucket] += r.outstanding;
    by.set(r.party.id, p);
  }
  return { buckets, total: rows.reduce((t, r) => t + r.outstanding, 0), byParty: [...by.values()].sort((a, b) => b.total - a.total) };
}

export async function bankLedgers(companyId: string) {
  return db.ledger.findMany({ where: { companyId, kind: { in: ["BANK", "CASH"] } }, orderBy: [{ kind: "asc" }, { name: "asc" }], select: { id: true, name: true, kind: true } });
}

/** UPI deep link (NPCI spec) for an amount. */
export function upiLink(upiId: string, payee: string, amountPaise: number, note: string) {
  const p = new URLSearchParams({ pa: upiId, pn: payee, am: (amountPaise / 100).toFixed(2), cu: "INR", tn: note });
  return `upi://pay?${p.toString()}`;
}
