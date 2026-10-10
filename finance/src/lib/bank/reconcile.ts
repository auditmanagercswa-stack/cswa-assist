import { db, n } from "@/lib/db";
import { isoDate } from "@/lib/format";
import { matchScore } from "./parse";

/** Unmatched posted entries on a bank ledger (signed: + money in), with words to match against. */
export async function openBookEntries(companyId: string, ledgerId: string) {
  const lines = await db.voucherLine.findMany({
    where: { ledgerId, voucher: { companyId, status: "POSTED", reversalOfId: null, bankTxns: { none: {} } } },
    include: { voucher: { include: { party: true } } },
    orderBy: { voucher: { date: "desc" } }, take: 500,
  });
  return lines.map((l) => ({
    voucherId: l.voucherId, number: l.voucher.number, date: isoDate(l.voucher.date),
    amountPaise: (l.side === "DR" ? 1 : -1) * n(l.amountPaise),
    words: `${l.voucher.party?.name ?? ""} ${l.voucher.narration ?? ""}`, narration: l.voucher.narration ?? "",
  }));
}

/** Auto-match every unmatched statement line on a ledger to its best unique book entry. */
export async function autoMatch(companyId: string, ledgerId: string) {
  const [txns, book] = await Promise.all([
    db.bankTxn.findMany({ where: { companyId, ledgerId, status: "UNMATCHED" }, orderBy: { date: "asc" } }),
    openBookEntries(companyId, ledgerId),
  ]);
  const used = new Set<string>();
  let matched = 0;
  for (const t of txns) {
    const tx = { date: isoDate(t.date), amountPaise: n(t.amountPaise), description: t.description };
    const best = book.filter((b) => !used.has(b.voucherId)).map((b) => ({ b, s: matchScore(tx, b) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)[0];
    if (!best) continue;
    used.add(best.b.voucherId);
    await db.bankTxn.update({ where: { id: t.id }, data: { status: "MATCHED", voucherId: best.b.voucherId } });
    matched++;
  }
  return matched;
}

/** Suggestions for one line (top 3) for the manual reconcile view. */
export function suggestionsFor(txn: { date: string; amountPaise: number; description: string }, book: Awaited<ReturnType<typeof openBookEntries>>) {
  return book.map((b) => ({ ...b, score: matchScore(txn, b) })).filter((b) => b.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
}
