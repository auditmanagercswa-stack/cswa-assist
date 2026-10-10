/** A report as plain data — rendered on screen, to PDF and to Excel from the same object. */
export type Cell = string | number | null | { text: string; href?: string; money?: number };
export interface Column { label: string; money?: boolean; align?: "left" | "right"; width?: number }
export interface Section {
  heading?: string;
  columns: Column[];
  rows: { cells: Cell[]; tone?: "total" | "subtotal" | "muted" | "heading" }[];
  note?: string;
}
export interface ReportDoc {
  key: string;
  title: string;
  company: string;
  period: string;
  sections: Section[];
  footnote?: string;
  /** Headline figures shown above the tables on screen. */
  kpis?: { label: string; value: number }[];
}
export const REPORTS: { key: string; title: string; blurb: string }[] = [
  { key: "pl", title: "Profit & Loss", blurb: "Income, costs and profit for the period — Schedule III layout for companies." },
  { key: "bs", title: "Balance Sheet", blurb: "What the business owns and owes at period end." },
  { key: "tb", title: "Trial Balance", blurb: "Every ledger's opening, movement and closing. Debits equal credits." },
  { key: "daybook", title: "Day Book", blurb: "All vouchers in date order." },
  { key: "ledger", title: "Ledger", blurb: "Account statement for any ledger with running balance." },
  { key: "cashflow", title: "Cash Flow", blurb: "Cash and bank movement by operating, investing and financing." },
  { key: "gstr1", title: "GSTR-1 working", blurb: "B2B, B2C and HSN summary from your invoices." },
  { key: "gstr3b", title: "GSTR-3B working", blurb: "Output tax, eligible ITC and net payable." },
  { key: "itc", title: "ITC register", blurb: "Input tax credit by purchase bill." },
  { key: "tds", title: "TDS summary", blurb: "TDS deducted by section and deposited." },
];
