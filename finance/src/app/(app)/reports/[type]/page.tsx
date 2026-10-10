import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Sheet } from "lucide-react";
import { getCtx } from "@/lib/session";
import { db } from "@/lib/db";
import { buildReport } from "@/lib/reports/builders";
import { REPORTS } from "@/lib/reports/types";
import { Button } from "@/components/ui/button";
import { ReportView } from "@/components/reports/report-view";
import { LedgerPicker } from "@/components/reports/ledger-picker";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<{ ledger?: string; layout?: string }> }) {
  const ctx = await getCtx();
  const { type } = await params;
  const sp = await searchParams;
  if (!REPORTS.some((r) => r.key === type)) notFound();
  const doc = await buildReport(type, ctx, sp);
  if (!doc) notFound();
  const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
  const ledgers = type === "ledger" ? await db.ledger.findMany({ where: { companyId: ctx.company.id }, include: { group: true }, orderBy: { name: "asc" } }) : [];
  const layoutToggle = type === "pl" || type === "bs";
  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/reports" className="text-xs text-gold hover:underline">← Reports</Link>
          <h1 className="mt-1 text-3xl md:text-4xl">{doc.title}</h1>
          <p className="text-sm text-ink-2">{doc.company} · {doc.period}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {type === "ledger" && <LedgerPicker ledgers={ledgers.map((l) => ({ id: l.id, name: l.name, group: l.group.name }))} value={sp.ledger ?? ledgers.find((l) => doc.title.endsWith(l.name) || doc.title.includes(`· ${l.name}`))?.id} />}
          {layoutToggle && (
            <div className="inline-flex rounded-full bg-sand p-1 text-xs">
              <Link href={`/reports/${type}?layout=schedule3`} className={"rounded-full px-3 py-1.5 " + (doc.title.includes("Schedule III") || doc.title.startsWith("Statement") ? "bg-card shadow-sm" : "text-ink-2")}>Schedule III</Link>
              <Link href={`/reports/${type}?layout=tally`} className={"rounded-full px-3 py-1.5 " + (!(doc.title.includes("Schedule III") || doc.title.startsWith("Statement")) ? "bg-card shadow-sm" : "text-ink-2")}>Tally style</Link>
            </div>
          )}
          <Button asChild variant="outline"><a href={`/api/reports/${type}?format=pdf&${q}`}><FileDown /> PDF</a></Button>
          <Button asChild variant="outline"><a href={`/api/reports/${type}?format=xlsx&${q}`}><Sheet /> Excel</a></Button>
        </div>
      </div>
      <ReportView doc={doc} />
    </div>
  );
}
