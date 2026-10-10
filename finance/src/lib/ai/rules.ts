/**
 * Rule-based drafter — works with no API key and is the safety net when the model is unavailable.
 * Pure function of (text, chart); unit-tested in tests/rules.test.ts.
 */
import { parseAmount } from "@/lib/format";
import type { ChartContext, RawDraft } from "./schema";

const STOP = new Set(["paid", "from", "with", "this", "that", "month", "last", "for", "the", "and", "bought", "received", "rupees", "cash", "bank", "spent", "today", "yesterday", "through", "via", "using", "sent", "into", "some", "worth"]);

export const keywordsOf = (text: string) =>
  [...new Set(text.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)))];

/** Largest money-looking token in the sentence (₹25,000 / 1.2L / 25k / 25000). */
export function findAmount(text: string): number | null {
  const re = /(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|l|lac|lakh|lakhs|cr|crore)?\b/gi;
  let best: number | null = null;
  for (const m of text.matchAll(re)) {
    const raw = m[1].replace(/,/g, "");
    const hasMoneyMarker = /₹|rs|inr/i.test(m[0]) || !!m[2] || raw.length >= 3;
    if (!hasMoneyMarker) continue;
    if (/^(19|20)\d{2}$/.test(raw) && !m[2] && !/₹|rs|inr/i.test(m[0])) continue; // a year, not money
    const p = parseAmount(raw + (m[2] ?? ""));
    if (p != null && (best == null || p > best)) best = p;
  }
  return best;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function findDate(text: string, today: string): string {
  const t = text.toLowerCase();
  const base = new Date(today + "T00:00:00Z");
  if (/\byesterday\b/.test(t)) return new Date(base.getTime() - 86400000).toISOString().slice(0, 10);
  const m = /\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.exec(t);
  if (m) {
    const mo = MONTHS.indexOf(m[2]);
    let y = base.getUTCFullYear();
    const d = new Date(Date.UTC(y, mo, Number(m[1])));
    if (d > base) y -= 1;
    return new Date(Date.UTC(y, mo, Number(m[1]))).toISOString().slice(0, 10);
  }
  return today;
}

const has = (t: string, words: string[]) => words.some((w) => new RegExp(`\\b${w}`, "i").test(t));

export function ruleDraft(text: string, chart: ChartContext): RawDraft {
  const t = text.toLowerCase();
  const amount = findAmount(text);
  const date = findDate(text, chart.today);
  const byName = (n: string) => chart.ledgers.find((l) => l.name === n);
  const banks = chart.ledgers.filter((l) => l.kind === "BANK");
  const cash = chart.ledgers.find((l) => l.kind === "CASH");
  const suspense = chart.ledgers.find((l) => l.kind === "SUSPENSE");

  // Which bank/cash account?
  const namedBank = banks.find((b) => [b.name, ...b.aliases].some((a) => a.length > 2 && t.includes(a.toLowerCase().split(" ")[0])));
  const money = /\bcash\b/.test(t) && !namedBank ? cash : namedBank ?? banks[0] ?? cash;

  // Party mentioned?
  const party = chart.parties.find((p) => t.includes(p.name.toLowerCase().split(" ")[0]) && p.name.split(" ")[0].length > 3) ?? null;

  // Counter ledger: learned hints first, then aliases, then names.
  const kws = keywordsOf(text);
  const hint = chart.hints.find((h) => kws.includes(h.keyword));
  const aliasHit = chart.ledgers
    .filter((l) => l.kind !== "BANK" && l.kind !== "CASH")
    .map((l) => ({ l, score: Math.max(0, ...l.aliases.map((a) => (t.includes(a.toLowerCase()) ? a.length : 0)), t.includes(l.name.toLowerCase()) ? l.name.length : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.l;
  type L = ChartContext["ledgers"][number];
  let counter: L | null = (hint && chart.ledgers.find((l) => l.id === hint.ledgerId)) || aliasHit || null;

  const isContra = has(t, ["deposited cash", "withdrew", "withdrawn", "atm", "transfer(?:red)? to", "moved"]) && !party;
  const isReceipt = has(t, ["received", "got", "collected", "receipt", "customer paid", "credited"]);
  const isPayment = has(t, ["paid", "bought", "purchased", "spent", "pay", "transferred", "settled", "gave"]);
  const isSaleOnCredit = has(t, ["sold", "sale", "invoiced", "billed"]) && !isReceipt;

  let type: RawDraft["voucherType"] = "JOURNAL";
  let lines: RawDraft["lines"] = [];
  let confidence = 0.55;
  let question: string | null = null;
  const rupees = amount != null ? amount / 100 : 0;

  if (isContra && cash && money && money !== cash) {
    type = "CONTRA";
    const toBank = has(t, ["deposited"]);
    lines = toBank ? [{ ledger: money.name, side: "DR", amount: rupees }, { ledger: cash.name, side: "CR", amount: rupees }] : [{ ledger: cash.name, side: "DR", amount: rupees }, { ledger: money.name, side: "CR", amount: rupees }];
    confidence = 0.8;
  } else if (isReceipt && money) {
    type = "RECEIPT";
    if (!counter && party) counter = byName(party.name) ?? chart.ledgers.find((l) => l.id === party.ledgerId) ?? null;
    if (!counter && has(t, ["customer", "client", "debtor"])) { counter = suspense ?? null; question = "Which customer paid you? I'll post it against their account."; }
    if (!counter && has(t, ["sale", "sold"])) counter = byName("Sales") ?? null;
    lines = [{ ledger: money.name, side: "DR", amount: rupees }, { ledger: (counter ?? suspense)!.name, side: "CR", amount: rupees }];
    confidence = counter && counter !== suspense ? 0.8 : 0.45;
  } else if (isSaleOnCredit && party) {
    type = "SALES";
    lines = [{ ledger: chart.ledgers.find((l) => l.id === party.ledgerId)!.name, side: "DR", amount: rupees }, { ledger: "Sales", side: "CR", amount: rupees }];
    confidence = 0.6;
    question = "Should I raise a proper GST invoice for this sale instead? Use Invoice → New for tax-compliant billing.";
  } else if (isPayment && money) {
    type = "PAYMENT";
    if (!counter && party) counter = chart.ledgers.find((l) => l.id === party.ledgerId) ?? null;
    lines = [{ ledger: (counter ?? suspense)!.name, side: "DR", amount: rupees }, { ledger: money.name, side: "CR", amount: rupees }];
    confidence = counter ? (hint ? 0.9 : 0.8) : 0.4;
    if (!counter) question = "What was this payment for? (e.g. rent, salaries, a vendor bill)";
  } else {
    question = "Did money come in or go out — and from which account?";
    confidence = 0.3;
    if (counter && money) lines = [{ ledger: counter.name, side: "DR", amount: rupees }, { ledger: money.name, side: "CR", amount: rupees }];
  }

  if (amount == null) { question = "How much was it?"; confidence = Math.min(confidence, 0.3); }
  if (lines.length === 0 && suspense && money) lines = [{ ledger: suspense.name, side: "DR", amount: rupees }, { ledger: money.name, side: "CR", amount: rupees }];

  const narration = text.trim().replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase()).slice(0, 140);
  return { date, voucherType: type, narration, party: party?.name ?? null, lines, gst: null, tds: null, confidence, question };
}
