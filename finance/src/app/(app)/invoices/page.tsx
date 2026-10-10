import Link from "next/link";
import { FilePlus2, FileText } from "lucide-react";
import { getCtx } from "@/lib/session";
import { db, n } from "@/lib/db";
import { fmtDate, inr } from "@/lib/format";
import { todayUTC, daysBetween } from "@/lib/fy";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, PageTitle } from "@/components/ui/misc";
import { DocStatusChip } from "@/components/docs/status";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await getCtx();
  const { status } = await searchParams;
  const filter = status === "unpaid" ? { status: { in: ["ISSUED", "PARTIAL"] as ("ISSUED" | "PARTIAL")[] } } : status === "paid" ? { status: "PAID" as const } : {};
  const invoices = await db.invoice.findMany({ where: { companyId: ctx.company.id, date: { gte: ctx.period.from, lte: ctx.period.to }, ...filter }, include: { party: true }, orderBy: [{ date: "desc" }, { number: "desc" }] });
  const today = todayUTC();
  const total = invoices.filter((i) => i.status !== "CANCELLED").reduce((t, i) => t + n(i.totalPaise), 0);
  const tab = (key: string | undefined, label: string) => (
    <Link href={key ? `/invoices?status=${key}` : "/invoices"} className={"rounded-full px-4 py-1.5 text-sm " + (status === key ? "bg-card text-ink shadow-sm" : "text-ink-2")}>{label}</Link>
  );
  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageTitle pre="Sales" em="invoices" sub={`${ctx.period.label} · ${invoices.length} invoices · ${inr(total, { round: true })}`}
        actions={ctx.role !== "AUDITOR" && <Button asChild><Link href="/invoices/new"><FilePlus2 /> New invoice</Link></Button>} />
      <div className="inline-flex w-fit rounded-full bg-sand p-1">{tab(undefined, "All")}{tab("unpaid", "Unpaid")}{tab("paid", "Paid")}</div>
      <Card>
        {invoices.length === 0 ? (
          <EmptyState icon={<FileText />} title="No invoices in this period" body="Raise a GST invoice and it posts to your books automatically." action={ctx.role !== "AUDITOR" && <Button asChild><Link href="/invoices/new">Create your first invoice</Link></Button>} />
        ) : (
          <DataTable>
            <thead><tr><th>Number</th><th>Date</th><th>Customer</th><th className="!text-right">Amount</th><th className="!text-right">Balance</th><th>Status</th></tr></thead>
            <tbody>
              {invoices.map((i) => {
                const bal = n(i.totalPaise) - n(i.paidPaise);
                return (
                  <tr key={i.id}>
                    <td><Link href={`/invoices/${i.id}`} className="font-medium text-ink hover:text-gold">{i.number}</Link></td>
                    <td className="whitespace-nowrap text-ink-2">{fmtDate(i.date)}</td>
                    <td>{i.party.name}<span className="block text-xs text-ink-3">{i.interState ? "Inter-state · IGST" : "Intra-state · CGST+SGST"}</span></td>
                    <td className="money text-right">{inr(n(i.totalPaise))}</td>
                    <td className="money text-right">{i.status === "CANCELLED" ? "—" : inr(bal)}</td>
                    <td><DocStatusChip status={i.status} overdue={bal > 0 ? daysBetween(i.dueDate, today) : undefined} /></td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </Card>
    </div>
  );
}
