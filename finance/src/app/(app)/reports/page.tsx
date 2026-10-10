import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { getCtx } from "@/lib/session";
import { REPORTS } from "@/lib/reports/types";
import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/misc";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await getCtx();
  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageTitle pre="Your" em="reports" sub={`${ctx.period.label} · every report exports to PDF and Excel`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Link key={r.key} href={`/reports/${r.key}`} className="group">
            <Card className="h-full p-5 transition-transform duration-200 group-hover:-translate-y-0.5">
              <span className="mb-3 grid size-10 place-items-center rounded-full bg-sand text-gold"><BarChart3 className="size-5" /></span>
              <h2 className="text-xl group-hover:text-gold">{r.title}</h2>
              <p className="mt-1 text-sm text-ink-2">{r.blurb}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
