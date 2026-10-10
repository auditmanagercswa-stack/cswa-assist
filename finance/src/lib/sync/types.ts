/**
 * Sync adapters move masters and vouchers between this app and another accounting system.
 * Tally Prime XML is implemented; Winman / Zoho Books adapters can implement the same interface.
 */
import type { Ctx } from "@/lib/session";

export interface ImportSummary { groups: number; ledgers: number; vouchers: number; skipped: number; errors: string[] }

export interface SyncAdapter {
  id: string;
  label: string;
  status: "available" | "planned";
  exportData?(ctx: Ctx, what: "masters" | "vouchers" | "all"): Promise<{ filename: string; mime: string; body: string }>;
  importData?(ctx: Ctx, content: string): Promise<ImportSummary>;
}

/** Neutral shapes both directions use. Amounts in paise. */
export interface XGroup { name: string; parent: string | null }
export interface XLedger { name: string; parent: string; openingPaise: number; gstin?: string | null; state?: string | null }
export interface XVoucher { type: string; date: string; number: string; narration: string; party: string | null; lines: { ledger: string; side: "DR" | "CR"; amountPaise: number }[] }
