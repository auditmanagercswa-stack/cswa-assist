import "server-only";
import { Prisma } from "@prisma/client";
import { db, n } from "@/lib/db";

/** Closing balance (Dr positive, incl. opening) for a set of ledgers. Drafts don't count. */
export async function balancesByLedger(companyId: string, ledgerIds: string[]) {
  if (!ledgerIds.length) return new Map<string, number>();
  const rows = await db.$queryRaw<{ id: string; bal: bigint }[]>`
    SELECT l.id, (l."openingPaise" + COALESCE((
      SELECT SUM(CASE WHEN vl.side='DR' THEN vl."amountPaise" ELSE -vl."amountPaise" END)
      FROM "VoucherLine" vl JOIN "Voucher" v ON v.id = vl."voucherId"
      WHERE vl."ledgerId" = l.id AND v.status IN ('POSTED','REVERSED')), 0))::bigint AS bal
    FROM "Ledger" l
    WHERE l."companyId" = ${companyId} AND l.id IN (${Prisma.join(ledgerIds)})`;
  return new Map(rows.map((r) => [r.id, n(r.bal)]));
}
