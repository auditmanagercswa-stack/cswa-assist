/**
 * Compliance calendar — standard statutory due dates.
 * Edit `extensions` when CBIC/CBDT notify an extension: key is `${code}:${period}`, value is the new ISO date.
 * Periods: monthly "YYYY-MM" (the month the return covers), quarterly "FY-Qn", yearly "FY".
 */

export type Requirement = "gst" | "tan" | "pf" | "pt" | "always";

export interface ComplianceRule {
  code: string;
  title: string;
  subtitle: string;
  requires: Requirement;
  /** Produces [period, dueDate] pairs for a financial year starting April `fy`. */
  schedule: (fy: number) => { period: string; due: Date; subtitle?: string }[];
}

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m, day));
/** The 12 months of the FY as [year, monthIndex]. */
const months = (fy: number) => Array.from({ length: 12 }, (_, i) => [i < 9 ? fy : fy + 1, (3 + i) % 12] as const);
const ym = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const COMPLIANCE_RULES: ComplianceRule[] = [
  {
    code: "GSTR1", title: "GSTR-1", subtitle: "Outward supplies", requires: "gst",
    schedule: (fy) => months(fy).map(([y, m]) => ({ period: ym(y, m), due: d(y, m + 1, 11), subtitle: `Outward supplies · ${MON[m]} ${y}` })),
  },
  {
    code: "GSTR3B", title: "GSTR-3B & GST payment", subtitle: "Summary return + tax", requires: "gst",
    schedule: (fy) => months(fy).map(([y, m]) => ({ period: ym(y, m), due: d(y, m + 1, 20), subtitle: `${MON[m]} ${y}` })),
  },
  {
    code: "TDS_DEPOSIT", title: "TDS deposit", subtitle: "Challan ITNS 281", requires: "tan",
    // March TDS is due 30 April; every other month the 7th of the next month.
    schedule: (fy) => months(fy).map(([y, m]) => ({ period: ym(y, m), due: m === 2 ? d(y, 3, 30) : d(y, m + 1, 7), subtitle: `Deducted in ${MON[m]} ${y}` })),
  },
  {
    code: "TDS_RETURN", title: "TDS return (24Q/26Q)", subtitle: "Quarterly statement", requires: "tan",
    schedule: (fy) => [
      { period: `${fy}-Q1`, due: d(fy, 6, 31), subtitle: "Q1 · Apr–Jun" },
      { period: `${fy}-Q2`, due: d(fy, 9, 31), subtitle: "Q2 · Jul–Sep" },
      { period: `${fy}-Q3`, due: d(fy + 1, 0, 31), subtitle: "Q3 · Oct–Dec" },
      { period: `${fy}-Q4`, due: d(fy + 1, 4, 31), subtitle: "Q4 · Jan–Mar" },
    ],
  },
  {
    code: "ADVANCE_TAX", title: "Advance tax", subtitle: "Income tax instalment", requires: "always",
    schedule: (fy) => [
      { period: `${fy}-1`, due: d(fy, 5, 15), subtitle: "1st instalment · 15% cumulative" },
      { period: `${fy}-2`, due: d(fy, 8, 15), subtitle: "2nd instalment · 45% cumulative" },
      { period: `${fy}-3`, due: d(fy, 11, 15), subtitle: "3rd instalment · 75% cumulative" },
      { period: `${fy}-4`, due: d(fy + 1, 2, 15), subtitle: "4th instalment · 100% cumulative" },
    ],
  },
  {
    code: "PF_ESI", title: "PF / ESI", subtitle: "Employee contributions", requires: "pf",
    schedule: (fy) => months(fy).map(([y, m]) => ({ period: ym(y, m), due: d(y, m + 1, 15), subtitle: `Wages for ${MON[m]} ${y}` })),
  },
  {
    // Maharashtra employer PT: last day of the month. Change for your state.
    code: "PROF_TAX", title: "Professional tax", subtitle: "Employer return & payment", requires: "pt",
    schedule: (fy) => months(fy).map(([y, m]) => ({ period: ym(y, m), due: d(y, m + 1, 0), subtitle: `${MON[m]} ${y} · Maharashtra rule` })),
  },
  {
    code: "ITR", title: "Income tax return", subtitle: "Audit cases", requires: "always",
    schedule: (fy) => [{ period: `${fy}`, due: d(fy + 1, 9, 31), subtitle: `For FY ${fy}-${String((fy + 1) % 100).padStart(2, "0")} (tax audit cases)` }],
  },
  {
    code: "GSTR9", title: "GSTR-9 annual return", subtitle: "Annual GST return", requires: "gst",
    schedule: (fy) => [{ period: `${fy}`, due: d(fy + 1, 11, 31), subtitle: `For FY ${fy}-${String((fy + 1) % 100).padStart(2, "0")}` }],
  },
];

/** Notified extensions override the standard date. Example: "GSTR3B:2026-09": "2026-10-25". */
export const EXTENSIONS: Record<string, string> = {};

export function dueDatesForFy(fy: number, has: Record<Requirement, boolean>) {
  return COMPLIANCE_RULES.filter((r) => has[r.requires]).flatMap((r) =>
    r.schedule(fy).map((s) => {
      const ext = EXTENSIONS[`${r.code}:${s.period}`];
      return { code: r.code, title: r.title, period: s.period, subtitle: s.subtitle ?? r.subtitle, dueOn: ext ? new Date(ext + "T00:00:00Z") : s.due };
    })
  );
}
