/** "this quarter", "last month", "in August", "this year" → date range. Pure; unit-tested. */
import { fyRange, fyStartYear, utc } from "@/lib/fy";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function periodFromText(text: string, today: Date, fallback: { from: Date; to: Date; label: string }) {
  const t = text.toLowerCase();
  const y = today.getUTCFullYear(), m = today.getUTCMonth();
  const qStart = (mm: number) => Math.floor(((mm + 9) % 12) / 3) * 3; // FY quarter index in months from April
  if (/\blast month\b/.test(t)) return { from: utc(y, m - 1, 1), to: utc(y, m, 0), label: "last month" };
  if (/\bthis month\b/.test(t)) return { from: utc(y, m, 1), to: today, label: "this month" };
  if (/\b(this|current) quarter\b/.test(t)) { const fq = qStart(m); const s = utc(fyStartYear(today), 3 + fq, 1); return { from: s, to: today, label: "this quarter" }; }
  if (/\blast quarter\b/.test(t)) { const fq = qStart(m); const s = utc(fyStartYear(today), 3 + fq - 3, 1); return { from: s, to: utc(s.getUTCFullYear(), s.getUTCMonth() + 3, 0), label: "last quarter" }; }
  if (/\blast (financial )?year\b|\blast fy\b/.test(t)) { const r = fyRange(fyStartYear(today) - 1); return { ...r, label: "last financial year" }; }
  if (/\b(this|current) (financial )?year\b|\bthis fy\b|\bytd\b/.test(t)) return { from: fyRange(fyStartYear(today)).from, to: today, label: "this financial year" };
  const mi = MONTHS.findIndex((name) => new RegExp(`\\b(${name}|${name.slice(0, 3)})\\b`).test(t));
  if (mi >= 0) { const yy = mi > m ? y - 1 : y; return { from: utc(yy, mi, 1), to: utc(yy, mi + 1, 0), label: `${MONTHS[mi][0].toUpperCase()}${MONTHS[mi].slice(1)} ${yy}` }; }
  return fallback;
}
