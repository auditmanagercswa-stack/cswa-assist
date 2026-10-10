/**
 * Pure double-entry rules — no database access, fully unit-tested (tests/accounting.test.ts).
 * Amounts are integer paise.
 */

export type SideT = "DR" | "CR";
export interface Line { ledgerId: string; side: SideT; amountPaise: number }

/** Errors that make a voucher unpostable. Empty array = valid. */
export function validateLines(lines: Line[]): string[] {
  const errs: string[] = [];
  if (lines.length < 2) errs.push("A voucher needs at least two lines.");
  for (const l of lines) {
    if (!Number.isInteger(l.amountPaise) || l.amountPaise <= 0) errs.push("Every line must have a positive amount.");
    if (!l.ledgerId) errs.push("Every line needs a ledger.");
  }
  const { dr, cr } = totals(lines);
  if (dr !== cr) errs.push(`Debits (${dr / 100}) and credits (${cr / 100}) don't match.`);
  if (!lines.some((l) => l.side === "DR") || !lines.some((l) => l.side === "CR")) errs.push("A voucher needs at least one debit and one credit.");
  return [...new Set(errs)];
}

export function totals(lines: Line[]) {
  let dr = 0, cr = 0;
  for (const l of lines) {
    if (l.side === "DR") dr += l.amountPaise;
    else cr += l.amountPaise;
  }
  return { dr, cr };
}

/** Reversal = same lines, sides swapped. */
export const reverseLines = <T extends Line>(lines: T[]): T[] => lines.map((l) => ({ ...l, side: l.side === "DR" ? "CR" : "DR" }));

/** Signed effect on a ledger: Dr positive. */
export const signed = (l: { side: SideT; amountPaise: number }) => (l.side === "DR" ? l.amountPaise : -l.amountPaise);

// ───────────── GST ─────────────

export interface GstSplit { taxable: number; cgst: number; sgst: number; igst: number; tax: number; total: number }

/** Intra-state → CGST + SGST (half each); inter-state → IGST. Rounded per head to the paisa. */
export function gstSplit(taxablePaise: number, rate: number, interState: boolean): GstSplit {
  if (interState) {
    const igst = Math.round((taxablePaise * rate) / 100);
    return { taxable: taxablePaise, cgst: 0, sgst: 0, igst, tax: igst, total: taxablePaise + igst };
  }
  const half = Math.round((taxablePaise * rate) / 200);
  return { taxable: taxablePaise, cgst: half, sgst: half, igst: 0, tax: half * 2, total: taxablePaise + half * 2 };
}

/** Back out GST from a tax-inclusive amount. */
export function gstFromInclusive(totalPaise: number, rate: number, interState: boolean): GstSplit {
  const taxable = Math.round((totalPaise * 100) / (100 + rate));
  const s = gstSplit(taxable, rate, interState);
  // Absorb the paisa difference into taxable so total is exact.
  const diff = totalPaise - s.total;
  return { ...s, taxable: s.taxable + diff, total: totalPaise };
}

/** Place of supply: different state codes → inter-state. Unknown POS defaults to intra-state. */
export const isInterState = (supplierState: string, posState: string | null | undefined) => !!posState && supplierState !== posState;

/** Round a document total to the nearest rupee; returns the round-off line (signed, + means added). */
export function roundToRupee(paise: number) {
  const rounded = Math.round(paise / 100) * 100;
  return { rounded, roundOff: rounded - paise };
}

// ───────────── Identity numbers ─────────────

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]$/;
const TAN_RE = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
const GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** GSTIN check digit (mod-36 Luhn variant used by GSTN). */
export function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GST_CHARS.indexOf(first14[i]);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GST_CHARS[(36 - (sum % 36)) % 36];
}

export function validateGstin(raw: string): { ok: boolean; reason?: string } {
  const g = raw.trim().toUpperCase();
  if (g.length !== 15) return { ok: false, reason: "A GSTIN has 15 characters." };
  if (!GSTIN_RE.test(g)) return { ok: false, reason: "Format should be 2-digit state code, PAN, entity number, Z, check digit." };
  if (gstinCheckDigit(g.slice(0, 14)) !== g[14]) return { ok: false, reason: "Check digit doesn't match — look for a typo." };
  return { ok: true };
}
export const validatePan = (raw: string) => PAN_RE.test(raw.trim().toUpperCase());
export const validateTan = (raw: string) => TAN_RE.test(raw.trim().toUpperCase());
export const stateOfGstin = (g: string) => g.slice(0, 2);
export const panOfGstin = (g: string) => g.slice(2, 12);

// ───────────── Ageing ─────────────

export const AGEING_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;
export type Bucket = (typeof AGEING_BUCKETS)[number];

/** Bucket by days past the due date (not yet due counts as 0-30). */
export function bucketFor(daysOverdue: number): Bucket {
  if (daysOverdue <= 30) return "0-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

export function ageing(items: { outstandingPaise: number; dueDate: Date }[], asOf: Date) {
  const out: Record<Bucket, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const i of items) {
    const days = Math.floor((asOf.getTime() - i.dueDate.getTime()) / 86400000);
    out[bucketFor(days)] += i.outstandingPaise;
  }
  return out;
}

// ───────────── Books health ─────────────

export interface HealthInputs {
  unreconciledBankLines: number;
  unpostedDrafts: number;
  overdueFilings: number;
  partiesMissingGstin: number;
  suspenseBalancePaise: number;
}

/**
 * 100 minus capped penalties. Each factor has a ceiling so one problem can't zero the score.
 * Returns the score and the reasons, worst first.
 */
export function healthScore(h: HealthInputs) {
  const parts = [
    { key: "bank", pts: Math.min(25, h.unreconciledBankLines * 2), why: `${h.unreconciledBankLines} bank lines to reconcile` },
    { key: "drafts", pts: Math.min(15, h.unpostedDrafts * 3), why: `${h.unpostedDrafts} drafts waiting to be posted` },
    { key: "filings", pts: Math.min(30, h.overdueFilings * 10), why: `${h.overdueFilings} overdue filings` },
    { key: "gstin", pts: Math.min(10, h.partiesMissingGstin * 2), why: `${h.partiesMissingGstin} parties without GSTIN` },
    { key: "suspense", pts: h.suspenseBalancePaise !== 0 ? 20 : 0, why: "Suspense account has a balance" },
  ];
  const score = Math.max(0, 100 - parts.reduce((t, p) => t + p.pts, 0));
  return { score, issues: parts.filter((p) => p.pts > 0).sort((a, b) => b.pts - a.pts) };
}
