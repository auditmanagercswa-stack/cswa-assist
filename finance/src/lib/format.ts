/**
 * Indian formatting helpers. All money in the app is held as integer paise
 * (number) and only formatted at the edge.
 */

const groupIN = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const groupIN2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,30,000 — drops paise when the amount is whole rupees. */
export function inr(paise: number, opts: { decimals?: boolean; sign?: boolean } = {}): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = abs / 100;
  const body = opts.decimals || abs % 100 !== 0 ? groupIN2.format(rupees) : groupIN.format(rupees);
  const prefix = neg ? "−₹" : opts.sign && paise > 0 ? "+₹" : "₹";
  return prefix + body;
}

/** ₹1.2L / ₹3.4Cr / ₹45K compact form for chips and charts. */
export function inrCompact(paise: number): string {
  const neg = paise < 0;
  const r = Math.abs(paise) / 100;
  const fmt = (n: number, suffix: string) => `${neg ? "−" : ""}₹${(Math.round(n * 10) / 10).toString()}${suffix}`;
  if (r >= 1e7) return fmt(r / 1e7, "Cr");
  if (r >= 1e5) return fmt(r / 1e5, "L");
  if (r >= 1e3) return fmt(r / 1e3, "K");
  return `${neg ? "−" : ""}₹${groupIN.format(r)}`;
}

/** Rupee string or number → paise. Understands "1.2L", "25k", "₹25,000", "1.5 cr". */
export function parseAmount(input: string | number): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input * 100) : null;
  const s = input.toLowerCase().replace(/[₹,\s]|rs\.?|inr/g, "");
  const m = /^(-?\d+(?:\.\d+)?)(k|l|lac|lakh|lakhs|cr|crore|crores)?$/.exec(s);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult = !m[2] ? 1 : m[2] === "k" ? 1e3 : m[2].startsWith("c") ? 1e7 : 1e5;
  return Math.round(n * mult * 100);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 05 Oct 2026 */
export function fmtDate(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${String(x.getUTCDate()).padStart(2, "0")} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
}
export const monthShort = (d: Date) => MONTHS[d.getUTCMonth()];

/** ISO yyyy-mm-dd (UTC date part — all accounting dates are stored at UTC midnight). */
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Mask PAN / account numbers for display: ABCDE1234F → ABXXXX234F-style. */
export function mask(value: string | null | undefined, visible = 4): string {
  if (!value) return "";
  if (value.length <= visible) return value;
  return "•".repeat(Math.max(0, value.length - visible)) + value.slice(-visible);
}
