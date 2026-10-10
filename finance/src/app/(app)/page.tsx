import Link from "next/link";
import { getCtx } from "@/lib/session";
import { homeData } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { fyLabel } from "@/lib/fy";
import { aiEnabled } from "@/lib/ai/client";
import { RecordCard } from "@/components/home/record-card";
import { ProfitCard } from "@/components/home/profit-card";
import { MiniCards } from "@/components/home/mini-cards";
import { DuePanel } from "@/components/home/due-panel";
import { AskPanel } from "@/components/ask/ask-panel";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const ctx = await getCtx();
  const [d, ledgers] = await Promise.all([
    homeData(ctx),
    db.ledger.findMany({ where: { companyId: ctx.company.id, isActive: true }, include: { group: true }, orderBy: { name: "asc" } }),
  ]);
  const options = ledgers.map((l) => ({ id: l.id, name: l.name, group: l.group.name }));

  return (
    <div className="mx-auto grid max-w-[1400px] gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.9fr)_minmax(280px,0.9fr)] lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
      <div className="min-w-0 lg:row-span-2 xl:row-span-1">
        <RecordCard d={d} ledgers={options} canWrite={ctx.role !== "AUDITOR"} aiOn={aiEnabled()} askSlot={<AskPanel compact />} />
      </div>
      <div className="grid content-start gap-4">
        <ProfitCard fyLabel={fyLabel(ctx.fy)} periodLabel={ctx.period.label} income={d.profit.income} expenses={d.profit.expenses} net={d.profit.net} />
        <MiniCards d={d} />
        <Link href="/reports/pl" className="text-center text-xs text-gold hover:underline">Open Profit &amp; Loss →</Link>
      </div>
      <div className="min-w-0"><DuePanel dues={d.dues} hasTan={d.hasTan} /></div>
    </div>
  );
}
