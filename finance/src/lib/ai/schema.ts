import { z } from "zod";

/**
 * What the model (or the rule-based drafter) must return for one business event.
 * Amounts are rupees (numbers); ledgers are referenced by exact name from the chart we send.
 */
export const DraftSchema = z.object({
  date: z.string().describe("Voucher date as YYYY-MM-DD"),
  voucherType: z.enum(["PAYMENT", "RECEIPT", "JOURNAL", "SALES", "PURCHASE", "CONTRA"]),
  narration: z.string().describe("Short accountant-style narration"),
  party: z.string().nullable().describe("Exact party name from the list, or a new name, or null"),
  lines: z.array(z.object({
    ledger: z.string().describe("Exact ledger name from the chart of accounts"),
    side: z.enum(["DR", "CR"]),
    amount: z.number().describe("Rupees, positive"),
  })),
  gst: z.object({
    rate: z.number(),
    hsnSac: z.string().nullable(),
    taxable: z.number(),
    cgst: z.number(),
    sgst: z.number(),
    igst: z.number(),
  }).nullable(),
  tds: z.object({ section: z.string(), rate: z.number(), amount: z.number() }).nullable(),
  confidence: z.number().describe("0 to 1 — how sure you are this entry is right"),
  question: z.string().nullable().describe("One short clarifying question when unsure, else null"),
});
export type RawDraft = z.infer<typeof DraftSchema>;

/** Draft after ledger names are resolved to this company's ledgers. Amounts in paise. */
export interface ResolvedDraft {
  date: string;
  voucherType: RawDraft["voucherType"];
  narration: string;
  partyId: string | null;
  partyName: string | null;
  lines: { ledgerId: string; ledger: string; side: "DR" | "CR"; amountPaise: number }[];
  gst: RawDraft["gst"];
  tds: { section: string; rate: number; amountPaise: number } | null;
  confidence: number;
  question: string | null;
  engine: "claude" | "rules";
  warnings: string[];
}

export interface ChartContext {
  today: string; // YYYY-MM-DD
  companyName: string;
  stateCode: string;
  gstRegistered: boolean;
  ledgers: { id: string; name: string; group: string; kind: string; aliases: string[] }[];
  parties: { id: string; name: string; kind: string; ledgerId: string; tdsSection: string | null }[];
  hints: { keyword: string; ledgerId: string }[];
}
