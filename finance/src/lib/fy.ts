/** Indian financial year (April–March) and reporting-period helpers. Dates are UTC midnight. */

export const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

/** Start year of the FY containing `d` (Oct 2026 → 2026, Feb 2027 → 2026). */
export const fyStartYear = (d: Date) => (d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1);

/** "FY 2026-27" */
export const fyLabel = (startYear: number) => `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;

export const fyRange = (startYear: number) => ({ from: utc(startYear, 3, 1), to: utc(startYear + 1, 2, 31) });

export type PeriodKey = string; // "fy" | "q1".."q4" | "m-2026-10" | "c-2026-04-01-2026-06-30"

export interface Period {
  key: PeriodKey;
  label: string;
  from: Date;
  to: Date;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Resolve a period key within a financial year. Unknown keys fall back to the whole FY. */
export function resolvePeriod(fy: number, key: PeriodKey | undefined): Period {
  const whole = { key: "fy", label: "Whole financial year", ...fyRange(fy) };
  if (!key || key === "fy") return whole;
  const q = /^q([1-4])$/.exec(key);
  if (q) {
    const i = Number(q[1]) - 1;
    const from = utc(fy, 3 + i * 3, 1);
    const to = utc(fy, 3 + i * 3 + 3, 0);
    return { key, label: `Q${i + 1} (${MONTH_NAMES[from.getUTCMonth()].slice(0, 3)}–${MONTH_NAMES[to.getUTCMonth()].slice(0, 3)})`, from, to };
  }
  const m = /^m-(\d{4})-(\d{2})$/.exec(key);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]) - 1;
    return { key, label: `${MONTH_NAMES[mo]} ${y}`, from: utc(y, mo, 1), to: utc(y, mo + 1, 0) };
  }
  const c = /^c-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (c) {
    const from = new Date(c[1] + "T00:00:00Z"), to = new Date(c[2] + "T00:00:00Z");
    if (from <= to) return { key, label: `${c[1]} to ${c[2]}`, from, to };
  }
  return whole;
}

/** The 12 months of an FY as period keys, for selectors. */
export function fyMonths(fy: number): { key: string; label: string }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = utc(fy, 3 + i, 1);
    const y = d.getUTCFullYear(), mo = d.getUTCMonth();
    return { key: `m-${y}-${String(mo + 1).padStart(2, "0")}`, label: `${MONTH_NAMES[mo]} ${y}` };
  });
}

export const todayUTC = () => {
  const n = new Date();
  return utc(n.getFullYear(), n.getMonth(), n.getDate());
};

export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);
