import { Building2 } from "lucide-react";
import { getCtx } from "@/lib/session";
import { db } from "@/lib/db";
import { healthFor } from "@/lib/dashboard";
import { receivables } from "@/lib/queries";
import { fmtDate, inr } from "@/lib/format";
import { todayUTC, daysBetween } from "@/lib/fy";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { PageTitle } from "@/components/ui/misc";
import { SwitchCompany } from "@/components/settings/switch-company";

export const metadata = { title: "All clients" };

/** CA / firm view: every company you can access with health and the next filing. */
export default async function FirmPage() {
  const ctx = await getCtx();
  const ms = await db.membership.findMany({ where: { userId: ctx.user.id }, include: { company: true }, orderBy: { company: { name: "asc" } } });
  const today = todayUTC();
  const rows = await Promise.all(ms.map(async (m) => {
    const [h, next, r] = await Promise.all([
      healthFor(m.companyId),
      db.dueDate.findFirst({ where: { companyId: m.companyId, status: "PENDING" }, orderBy: { dueOn: "asc" } }),
      receivables(m.companyId),
    ]);
    return { m, h, next, recv: r.total };
  }));
  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageTitle pre="All" em="clients" sub={`${rows.length} companies you can access`} />
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map(({ m, h, next, recv }) => {
          const days = next ? daysBetween(today, next.dueOn) : null;
          return (
            <Card key={m.companyId} className={"grid gap-3 p-5 " + (m.companyId === ctx.company.id ? "ring-2 ring-gold" : "")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-forest text-gold-light"><Building2 className="size-5" /></span>
                  <div><p className="font-display text-lg">{m.company.name}</p><p className="text-xs text-ink-3">{m.company.gstin ?? "No GSTIN"} · {m.role.toLowerCase()}</p></div></div>
                <Chip tone={h.score >= 80 ? "mint" : h.score >= 60 ? "warn" : "danger"}>Health {h.score}</Chip>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-xs text-ink-2">Next due</dt><dd>{next ? <>{next.title} · {fmtDate(next.dueOn)} {days !== null && days < 0 ? <Chip tone="danger">{-days}d overdue</Chip> : null}</> : "Nothing pending"}</dd></div>
                <div><dt className="text-xs text-ink-2">Receivable</dt><dd className="money">{inr(recv, { round: true })}</dd></div>
              </dl>
              {h.issues.length > 0 && <p className="text-xs text-ink-3">{h.issues.slice(0, 2).map((i) => i.why).join(" · ")}</p>}
              {m.companyId !== ctx.company.id && <SwitchCompany id={m.companyId} />}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
