import Link from "next/link";
import { getCtx } from "@/lib/session";
import { db } from "@/lib/db";
import { taxHeadTotals } from "@/lib/accounting/ledger";
import { ensureDueDates } from "@/lib/company";
import { fmtDate, inr } from "@/lib/format";
import { todayUTC, daysBetween } from "@/lib/fy";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { PageTitle } from "@/components/ui/misc";
import { FiledToggle } from "@/components/home/filed-toggle";

export const metadata = { title: "GST & compliance" };

export default async function GstPage() {
  const ctx = await getCtx();
  await ensureDueDates(db, ctx.company.id, ctx.fy);
  const [t, dues] = await Promise.all([
    taxHeadTotals(ctx.company.id, ctx.period.from, ctx.period.to),
    db.dueDate.findMany({ where: { companyId: ctx.company.id, dueOn: { gte: ctx.period.from, lte: new Date(ctx.period.to.getTime() + 80 * 86400000) } }, orderBy: { dueOn: "asc" } }),
  ]);
  const today = todayUTC();
  const kpi = (label: string, v: number, tone = "") => <Card className="p-4"><p className="text-xs text-ink-2">{label}</p><p className={"money mt-1 text-2xl " + tone}>{inr(v, { round: true })}</p></Card>;
  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageTitle pre="GST &" em="compliance" sub={`${ctx.company.gstin ? `GSTIN ${ctx.company.gstin}` : "Not GST registered"} · ${ctx.period.label}`} />
      <div className="grid gap-3 sm:grid-cols-4">
        {kpi("Output tax", t.totalOut)}{kpi("Input tax credit", t.totalIn)}{kpi("Net payable in cash", t.netPayable, t.netPayable ? "text-danger" : "")}{kpi("TDS deducted", t.tdsDeducted)}
      </div>
      <div className="flex flex-wrap gap-2">
        {[["gstr1", "GSTR-1 working"], ["gstr3b", "GSTR-3B working"], ["itc", "ITC register"], ["tds", "TDS summary"]].map(([k, l]) => <Link key={k} href={`/reports/${k}`} className="rounded-full border border-hairline bg-card px-4 py-2 text-sm hover:border-gold">{l} →</Link>)}
      </div>
      <Card id="calendar" className="p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-xl">Compliance <em className="text-gold">calendar</em></h2><span className="text-xs text-ink-3">Standard dates — check for extensions. Edit src/config/compliance-calendar.ts to change them.</span></div>
        <ul className="divide-y divide-hairline">
          {dues.map((d) => {
            const days = daysBetween(today, d.dueOn);
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="money w-28 shrink-0 text-sm">{fmtDate(d.dueOn)}</span>
                <span className="min-w-0 flex-1"><b className="text-sm">{d.title}</b><span className="block text-xs text-ink-2">{d.subtitle}</span></span>
                {d.status === "FILED" ? <Chip tone="mint">Filed{d.filedAt ? ` ${fmtDate(d.filedAt)}` : ""}</Chip> : days < 0 ? <Chip tone="danger">{-days}d overdue</Chip> : days <= 3 ? <Chip tone="danger">{days}d left</Chip> : <Chip>{days}d left</Chip>}
                {ctx.role !== "AUDITOR" && <FiledToggle id={d.id} filed={d.status === "FILED"} />}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
