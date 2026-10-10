import Link from "next/link";
import { Wallet, ReceiptText } from "lucide-react";
import { getCtx } from "@/lib/session";
import { payables, bankLedgers } from "@/lib/queries";
import { fmtDate, inr } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { DataTable, EmptyState, PageTitle } from "@/components/ui/misc";
import { AgeingSummary } from "@/components/docs/ageing";
import { DocStatusChip } from "@/components/docs/status";
import { PaymentDialog } from "@/components/docs/payment-dialog";
import { ScheduleButton } from "@/components/docs/schedule-button";

export const metadata = { title: "Payables" };

export default async function PayablesPage() {
  const ctx = await getCtx();
  const [p, banks] = await Promise.all([payables(ctx.company.id), bankLedgers(ctx.company.id)]);
  const canWrite = ctx.role !== "AUDITOR";
  const scheduled = p.rows.filter((r) => r.scheduledOn).reduce((t, r) => t + r.outstanding, 0);
  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageTitle pre="What you" em="owe" sub={`Net of TDS. ${scheduled ? `${inr(scheduled, { round: true })} scheduled for payment.` : ""}`} actions={canWrite && <Button asChild><Link href="/bills/new"><ReceiptText /> New bill</Link></Button>} />
      <AgeingSummary buckets={p.buckets} total={p.total} label="Total payable" />
      <Card>
        {p.rows.length === 0 ? <EmptyState icon={<Wallet />} title="All bills are paid" body="Record vendor bills as they come in to keep payables and ITC accurate." /> : (
          <DataTable>
            <thead><tr><th>Vendor</th><th>Bill</th><th>Due</th><th className="!text-right">TDS</th><th className="!text-right">Payable</th><th>Status</th><th /></tr></thead>
            <tbody>{p.rows.map((x) => (
              <tr key={x.id}>
                <td><Link href={`/parties/${x.party.id}`} className="font-medium hover:text-gold">{x.party.name}</Link></td>
                <td className="text-ink-2">{x.number}<span className="block text-xs text-ink-3">{fmtDate(x.date)}</span></td>
                <td className="whitespace-nowrap">{fmtDate(x.dueDate)}{x.scheduledOn && <Chip tone="gold" className="mt-1 block w-fit">Pay on {fmtDate(x.scheduledOn)}</Chip>}</td>
                <td className="money text-right text-ink-2">{x.tds ? inr(x.tds) : "—"}</td>
                <td className="money text-right">{inr(x.outstanding)}</td>
                <td><DocStatusChip status="ISSUED" overdue={x.overdue} /></td>
                <td className="whitespace-nowrap text-right">{canWrite && <div className="flex justify-end gap-1">
                  <ScheduleButton billId={x.id} current={x.scheduledOn ? x.scheduledOn.toISOString().slice(0, 10) : null} />
                  <PaymentDialog mode="payment" docId={x.id} outstanding={x.outstanding} banks={banks} title={`Pay ${x.party.name}`} trigger={<Button size="sm">Pay</Button>} />
                </div>}</td>
              </tr>
            ))}</tbody>
          </DataTable>
        )}
      </Card>
    </div>
  );
}
