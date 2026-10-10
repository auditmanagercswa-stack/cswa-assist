/**
 * Bank statement parsing — pure functions (tests/bank.test.ts).
 * Handles the common Indian bank export shapes: separate Withdrawal/Deposit columns,
 * or a single Amount column with Dr/Cr, dates as dd/mm/yyyy, dd-mm-yy, dd MMM yyyy or ISO.
 */
export interface StatementRow { date: string; description: string; reference: string | null; amountPaise: number; balancePaise: number | null }

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");
/** Short names ("dr", "cr", "amt") must match exactly so "Dr/Cr" isn't mistaken for a Debit column. */
const pickCol = (headers: string[], names: string[]) => headers.findIndex((h) => names.some((n) => norm(h) === n || (n.length > 3 && norm(h).startsWith(n))));

export function detectColumns(headers: string[]) {
  return {
    date: pickCol(headers, ["txndate", "transactiondate", "date", "valuedate", "postdate"]),
    desc: pickCol(headers, ["narration", "description", "particulars", "remarks", "details", "transactiondetails"]),
    ref: pickCol(headers, ["chqrefno", "refno", "reference", "chequeno", "utr", "chqno"]),
    debit: pickCol(headers, ["withdrawalamt", "withdrawal", "debitamount", "debit", "dr", "withdrawals"]),
    credit: pickCol(headers, ["depositamt", "deposit", "creditamount", "credit", "cr", "deposits"]),
    amount: pickCol(headers, ["amount", "transactionamount", "amt"]),
    drcr: pickCol(headers, ["drcr", "type", "crdr", "debitcredit"]),
    balance: pickCol(headers, ["closingbalance", "balance", "runningbalance", "availablebalance"]),
  };
}

const MON: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
export function parseDate(raw: unknown): string | null {
  if (raw instanceof Date && !isNaN(raw.getTime())) return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate())).toISOString().slice(0, 10);
  const s = String(raw ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return iso(y, Number(m[2]) - 1, Number(m[1])); }
  m = /^(\d{1,2})[\s\-/]([a-z]{3})[a-z]*[\s\-/,]+(\d{2,4})$/i.exec(s);
  if (m && MON[m[2].toLowerCase()] !== undefined) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return iso(y, MON[m[2].toLowerCase()], Number(m[1])); }
  return null;
}
const iso = (y: number, mo: number, d: number) => {
  const dt = new Date(Date.UTC(y, mo, d));
  return dt.getUTCMonth() === mo ? dt.toISOString().slice(0, 10) : null;
};

export function parseMoney(raw: unknown): number | null {
  if (typeof raw === "number") return Math.round(raw * 100);
  const s = String(raw ?? "").replace(/[₹,\s]|inr|rs\.?/gi, "");
  if (!s || s === "-") return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[()\-]/g, "").replace(/(cr|dr)$/i, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) * (neg ? -1 : 1);
}

/** Find the header row (statements often have a few lines of preamble) and parse the rows below it. */
export function parseTable(table: unknown[][]): { rows: StatementRow[]; skipped: number; error?: string } {
  const headerIdx = table.findIndex((r) => { const c = detectColumns(r.map(String)); return c.date >= 0 && c.desc >= 0 && (c.amount >= 0 || c.debit >= 0 || c.credit >= 0); });
  if (headerIdx < 0) return { rows: [], skipped: 0, error: "Couldn't find Date, Narration and Amount (or Withdrawal/Deposit) columns." };
  const c = detectColumns(table[headerIdx].map(String));
  const rows: StatementRow[] = [];
  let skipped = 0;
  for (const r of table.slice(headerIdx + 1)) {
    const date = parseDate(r[c.date]);
    let amt: number | null = null;
    if (c.debit >= 0 || c.credit >= 0) {
      const dr = c.debit >= 0 ? parseMoney(r[c.debit]) ?? 0 : 0;
      const cr = c.credit >= 0 ? parseMoney(r[c.credit]) ?? 0 : 0;
      amt = cr - Math.abs(dr) || null;
    } else if (c.amount >= 0) {
      const a = parseMoney(r[c.amount]);
      const t = c.drcr >= 0 ? String(r[c.drcr] ?? "").toLowerCase() : "";
      amt = a == null ? null : t.startsWith("d") ? -Math.abs(a) : t.startsWith("c") ? Math.abs(a) : a;
    }
    if (!date || !amt) { skipped++; continue; }
    rows.push({ date, description: String(r[c.desc] ?? "").trim().slice(0, 200), reference: c.ref >= 0 ? String(r[c.ref] ?? "").trim() || null : null, amountPaise: amt, balancePaise: c.balance >= 0 ? parseMoney(r[c.balance]) : null });
  }
  return { rows, skipped };
}

/** Score how well a book entry matches a statement line: exact amount required, closer date and shared words win. */
export function matchScore(txn: { date: string; amountPaise: number; description: string }, cand: { date: string; amountPaise: number; words: string }) {
  if (txn.amountPaise !== cand.amountPaise) return 0;
  const days = Math.abs((new Date(txn.date).getTime() - new Date(cand.date).getTime()) / 86400000);
  if (days > 5) return 0;
  const tw = new Set(txn.description.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const overlap = cand.words.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && tw.has(w)).length;
  return 100 - days * 10 + Math.min(20, overlap * 10);
}
