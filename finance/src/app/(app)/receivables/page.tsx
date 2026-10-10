import Link from "next/link";
import { HandCoins } from "lucide-react";
import { getCtx } from "@/lib/session";
import { receivables } from "@/lib/queries";
import { fmtDate, inr } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, PageTitle } from "@/components/ui/misc";
import { AgeingSummary } from "@/components/docs/ageing";
import { DocStatusChip } from "@/components/docs/status";

export const metadata = { title: "Receivables" };

export default async function ReceivablesPage() {
  const ctx = await getCtx();
  const r = await receivables(ctx.company.id);
  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageTitle pre="Money" em="owed" post="to you" sub="Unpaid invoices aged by days past the due date." actions={<Button asChild variant="gold"><Link href="/collect">Send reminders</Link></Button>} />
      <AgeingSummary buckets={r.buckets} total={r.total} label="Total receivable" />
      {r.rows.length === 0 ? <Card><EmptyState icon={<HandCoins />} title="Everyone has paid" body="No unpaid invoices right now." /></Card> : (<>
        <Card>
          <h2 className="px-6 pt-5 text-xl">By customer</h2>
          <DataTable>
            <thead><tr><th>Customer</th><th className="!text-right">0–30</th><th className="!text-right">31–60</th><th className="!text-right">61–90</th><th className="!text-right">90+</th><th className="!text-right">Total</th></tr></thead>
            <tbody>{r.byParty.map((p) => (
              <tr key={p.id}><td><Link href={`/parties/${p.id}`} className="font-medium hover:text-gold">{p.name}</Link><span className="block text-xs text-ink-3">{p.count} invoice{p.count > 1 ? "s" : ""}</span></td>
                {(["0-30", "31-60", "61-90", "90+"] as const).map((b) => <td key={b} className={"money text-right " + (b === "90+" && p.buckets[b] ? "text-danger" : "")}>{p.buckets[b] ? inr(p.buckets[b], { round: true }) : "—"}</td>)}
                <td className="money text-right font-semibold">{inr(p.total, { round: true })}</td></tr>
            ))}</tbody>
          </DataTable>
        </Card>
        <Card>
          <h2 className="px-6 pt-5 text-xl">Open invoices</h2>
          <DataTable>
            <thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th className="!text-right">Outstanding</th><th>Status</th></tr></thead>
            <tbody>{r.rows.map((x) => (
              <tr key={x.id}><td><Link href={`/invoices/${x.id}`} className="font-medium hover:text-gold">{x.number}</Link></td><td>{x.party.name}</td><td className="whitespace-nowrap">{fmtDate(x.dueDate)}</td><td className="money text-right">{inr(x.outstanding)}</td><td><DocStatusChip status="ISSUED" overdue={x.overdue} /></td></tr>
            ))}</tbody>
          </DataTable>
        </Card>
      </>)}
    </div>
  );
}
