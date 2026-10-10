import Link from "next/link";
import { Landmark } from "lucide-react";
import { getCtx } from "@/lib/session";
import { db, n } from "@/lib/db";
import { balancesAsOf } from "@/lib/accounting/ledger";
import { openBookEntries, suggestionsFor } from "@/lib/bank/reconcile";
import { fmtDate, inr, isoDate, mask } from "@/lib/format";
import { todayUTC } from "@/lib/fy";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState, PageTitle } from "@/components/ui/misc";
import { ReconcileRow } from "@/components/banking/reconcile-row";
import { ImportForm } from "@/components/banking/import-form";

export const metadata = { title: "Banking" };

export default async function BankingPage({ searchParams }: { searchParams: Promise<{ ledger?: string; view?: string }> }) {
  const ctx = await getCtx();
  const sp = await searchParams;
  const cid = ctx.company.id;
  const [bal, accounts] = await Promise.all([balancesAsOf(cid, todayUTC()), db.ledger.findMany({ where: { companyId: cid, kind: { in: ["BANK", "CASH"] } }, orderBy: [{ kind: "asc" }, { name: "asc" }] })]);
  const current = accounts.find((a) => a.id === sp.ledger) ?? accounts.find((a) => a.kind === "BANK") ?? accounts[0];
  if (!current) return <EmptyState title="No bank accounts" body="Add a bank ledger in Settings." />;
  const view = sp.view === "matched" ? "MATCHED" : "UNMATCHED";
  const [txns, counts, last, book, ledgers] = await Promise.all([
    db.bankTxn.findMany({ where: { companyId: cid, ledgerId: current.id, status: view }, include: { voucher: true }, orderBy: { date: "desc" }, take: 200 }),
    db.bankTxn.groupBy({ by: ["status"], _count: true, where: { companyId: cid, ledgerId: current.id } }),
    db.bankTxn.findFirst({ where: { companyId: cid, ledgerId: current.id, balancePaise: { not: null } }, orderBy: { date: "desc" } }),
    openBookEntries(cid, current.id),
    db.ledger.findMany({ where: { companyId: cid, kind: { notIn: ["BANK", "CASH"] }, isActive: true }, include: { group: true }, orderBy: { name: "asc" } }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const bookBal = bal.cashBank.find((b) => b.id === current.id)?.balance ?? 0;
  const canWrite = ctx.role !== "AUDITOR";
  const opts = ledgers.map((l) => ({ id: l.id, name: l.name, group: l.group.name }));
  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageTitle pre="Banking &" em="reconciliation" sub="Import a statement; we match it to your books. Fix what's left in a click." actions={canWrite && current.kind === "BANK" && <ImportForm ledgerId={current.id} />} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {accounts.map((a) => {
          const b = bal.cashBank.find((x) => x.id === a.id)?.balance ?? 0;
          return (
            <Link key={a.id} href={`/banking?ledger=${a.id}`}>
              <Card className={"p-4 transition-shadow duration-200 " + (a.id === current.id ? "ring-2 ring-gold" : "hover:shadow-lg")}>
                <p className="flex items-center gap-2 text-sm text-ink-2"><Landmark className="size-4 text-gold" />{a.name}</p>
                <p className="money mt-1 text-xl">{inr(b, { round: true })}</p>
                <p className="text-xs text-ink-3">{a.bankAccountNo ? `A/c ${mask(a.bankAccountNo)}` : a.kind === "CASH" ? "Cash in hand" : "Book balance"}</p>
              </Card>
            </Link>
          );
        })}
      </div>
      {current.kind === "BANK" && (
        <Card className="grid gap-3 p-5 sm:grid-cols-3">
          <div><p className="text-xs text-ink-2">Balance as per books</p><p className="money text-xl">{inr(bookBal)}</p></div>
          <div><p className="text-xs text-ink-2">Balance as per last statement line{last ? ` (${fmtDate(last.date)})` : ""}</p><p className="money text-xl">{last?.balancePaise != null ? inr(n(last.balancePaise)) : "—"}</p></div>
          <div><p className="text-xs text-ink-2">To reconcile</p><p className="text-xl">{count("UNMATCHED")} lines {count("UNMATCHED") ? <Chip tone="warn" className="ml-1 align-middle">affects health</Chip> : <Chip tone="mint" className="ml-1 align-middle">all clear</Chip>}</p></div>
        </Card>
      )}
      <div className="inline-flex w-fit rounded-full bg-sand p-1 text-sm">
        <Link href={`/banking?ledger=${current.id}`} className={"rounded-full px-4 py-1.5 " + (view === "UNMATCHED" ? "bg-card shadow-sm" : "text-ink-2")}>To reconcile · {count("UNMATCHED")}</Link>
        <Link href={`/banking?ledger=${current.id}&view=matched`} className={"rounded-full px-4 py-1.5 " + (view === "MATCHED" ? "bg-card shadow-sm" : "text-ink-2")}>Matched · {count("MATCHED")}</Link>
      </div>
      <Card className="px-5">
        {txns.length === 0 ? <EmptyState title={view === "UNMATCHED" ? "Nothing to reconcile" : "No matched lines yet"} body={view === "UNMATCHED" ? "Import this month's statement (CSV or Excel) to start." : undefined} /> : (
          <ul className="divide-y divide-hairline">
            {view === "UNMATCHED" ? txns.map((t) => {
              const tx = { id: t.id, date: isoDate(t.date), description: t.description, reference: t.reference, amountPaise: n(t.amountPaise) };
              return <ReconcileRow key={t.id} txn={tx} suggestions={suggestionsFor(tx, book)} ledgers={opts} canWrite={canWrite} />;
            }) : txns.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="w-24 text-ink-2">{fmtDate(t.date)}</span>
                <span className="min-w-0 flex-1 truncate">{t.description}</span>
                {t.voucher && <Link href={`/vouchers/${t.voucher.id}`} className="text-gold hover:underline">{t.voucher.number}</Link>}
                <span className="money w-32 text-right">{inr(n(t.amountPaise), { sign: true })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
