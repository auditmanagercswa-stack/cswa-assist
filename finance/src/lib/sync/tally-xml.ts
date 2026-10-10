/**
 * Tally Prime XML (Import Data envelope) — pure build/parse, unit-tested in tests/tally.test.ts.
 * Tally sign convention: debit amounts are NEGATIVE with ISDEEMEDPOSITIVE=Yes; credits positive.
 * Opening balances follow the same rule (debit balance is negative).
 */
import { XMLParser } from "fast-xml-parser";
import type { XGroup, XLedger, XVoucher } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const amt = (paise: number) => (paise / 100).toFixed(2);

export const TALLY_VCH: Record<string, string> = { PAYMENT: "Payment", RECEIPT: "Receipt", JOURNAL: "Journal", SALES: "Sales", PURCHASE: "Purchase", CONTRA: "Contra", CREDIT_NOTE: "Credit Note", DEBIT_NOTE: "Debit Note" };
export const FROM_TALLY_VCH: Record<string, string> = Object.fromEntries(Object.entries(TALLY_VCH).map(([k, v]) => [v.toLowerCase(), k]));

export function buildTallyXml(companyName: string, data: { groups?: XGroup[]; ledgers?: XLedger[]; vouchers?: XVoucher[] }) {
  const msgs: string[] = [];
  for (const g of data.groups ?? []) {
    msgs.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF"><GROUP NAME="${esc(g.name)}" ACTION="Create"><NAME>${esc(g.name)}</NAME><PARENT>${esc(g.parent ?? "")}</PARENT></GROUP></TALLYMESSAGE>`);
  }
  for (const l of data.ledgers ?? []) {
    msgs.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(l.name)}" ACTION="Create"><NAME>${esc(l.name)}</NAME><PARENT>${esc(l.parent)}</PARENT><OPENINGBALANCE>${amt(-l.openingPaise)}</OPENINGBALANCE>${l.gstin ? `<PARTYGSTIN>${esc(l.gstin)}</PARTYGSTIN>` : ""}${l.state ? `<LEDSTATENAME>${esc(l.state)}</LEDSTATENAME>` : ""}</LEDGER></TALLYMESSAGE>`);
  }
  for (const v of data.vouchers ?? []) {
    const vt = TALLY_VCH[v.type] ?? "Journal";
    const lines = v.lines.map((l) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(l.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${l.side === "DR" ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${amt(l.side === "DR" ? -l.amountPaise : l.amountPaise)}</AMOUNT></ALLLEDGERENTRIES.LIST>`).join("");
    msgs.push(`<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${vt}" ACTION="Create"><DATE>${v.date.replace(/-/g, "")}</DATE><VOUCHERTYPENAME>${vt}</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(v.number)}</VOUCHERNUMBER>${v.party ? `<PARTYLEDGERNAME>${esc(v.party)}</PARTYLEDGERNAME>` : ""}<NARRATION>${esc(v.narration)}</NARRATION>${lines}</VOUCHER></TALLYMESSAGE>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${esc(companyName)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>
${msgs.join("\n")}
</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}

const text = (v: unknown): string => (v == null ? "" : typeof v === "object" ? String((v as Record<string, unknown>)["#text"] ?? "") : String(v)).trim();
const money = (v: unknown) => Math.round(Number(text(v).replace(/[^\d.\-]/g, "") || 0) * 100);

/** Parse a Tally XML export (masters and/or vouchers). Unknown tags are ignored. */
export function parseTallyXml(xml: string) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", isArray: (name) => ["TALLYMESSAGE", "ALLLEDGERENTRIES.LIST", "LEDGERENTRIES.LIST"].includes(name), trimValues: true });
  const doc = parser.parse(xml);
  // Import envelopes keep messages in IMPORTDATA/REQUESTDATA; Tally "Export" responses use DATA.
  const body = doc?.ENVELOPE?.BODY ?? {};
  const holder = body.IMPORTDATA?.REQUESTDATA ?? body.DATA ?? body.IMPORTDATA ?? {};
  const messages: Record<string, unknown>[] = holder.TALLYMESSAGE ?? [];
  const groups: XGroup[] = [], ledgers: XLedger[] = [], vouchers: XVoucher[] = [];
  for (const m of messages) {
    const g = m.GROUP as Record<string, unknown> | undefined;
    if (g) groups.push({ name: text(g.NAME) || text(g["@NAME"]), parent: text(g.PARENT) || null });
    const l = m.LEDGER as Record<string, unknown> | undefined;
    if (l) ledgers.push({ name: text(l.NAME) || text(l["@NAME"]), parent: text(l.PARENT), openingPaise: -money(l.OPENINGBALANCE), gstin: text(l.PARTYGSTIN) || null, state: text(l.LEDSTATENAME) || null });
    const v = m.VOUCHER as Record<string, unknown> | undefined;
    if (v) {
      const entries = ((v["ALLLEDGERENTRIES.LIST"] ?? v["LEDGERENTRIES.LIST"] ?? []) as Record<string, unknown>[]);
      const d = text(v.DATE);
      vouchers.push({
        type: FROM_TALLY_VCH[(text(v.VOUCHERTYPENAME) || text(v["@VCHTYPE"])).toLowerCase()] ?? "JOURNAL",
        date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, number: text(v.VOUCHERNUMBER), narration: text(v.NARRATION), party: text(v.PARTYLEDGERNAME) || null,
        lines: entries.map((e) => {
          const a = money(e.AMOUNT);
          const isDr = text(e.ISDEEMEDPOSITIVE).toLowerCase() === "yes" || a < 0;
          return { ledger: text(e.LEDGERNAME), side: isDr ? "DR" as const : "CR" as const, amountPaise: Math.abs(a) };
        }).filter((x) => x.amountPaise > 0),
      });
    }
  }
  return { groups, ledgers, vouchers };
}
