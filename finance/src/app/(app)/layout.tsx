import { getCtx } from "@/lib/session";
import { Sidebar } from "@/components/shell/sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { TopBar } from "@/components/shell/top-bar";
import { fyLabel, fyStartYear, todayUTC } from "@/lib/fy";
import { fmtDate } from "@/lib/format";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx();
  const current = fyStartYear(todayUTC());
  const fyOptions = [current + 1, current, current - 1, current - 2].map((y) => ({ value: y, label: fyLabel(y) }));
  const initials = ctx.company.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const sync = ctx.company.lastSyncAt ? `Last ${ctx.company.lastSyncSource ?? "Tally"} sync ${fmtDate(ctx.company.lastSyncAt)}` : "Not synced with Tally yet";

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-gold focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
      <Sidebar initials={initials} syncLabel={sync} syncOk={!!ctx.company.lastSyncAt} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar companyName={ctx.company.name} companies={ctx.companies} companyId={ctx.company.id} fy={ctx.fy} fyOptions={fyOptions} periodKey={ctx.period.key} periodLabel={ctx.period.label} />
        {ctx.role === "AUDITOR" && <div className="bg-gold-soft px-4 py-2 text-center text-xs text-gold md:px-8">Read-only auditor access — you can view and export, but not change the books.</div>}
        <main id="main" className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
