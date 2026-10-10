import Link from "next/link";
import { Plus } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { inr, monthShort } from "@/lib/format";
import type { HomeData } from "@/lib/dashboard";

function daysChip(days: number) {
  if (days < 0) return <Chip tone="danger">{-days}d overdue</Chip>;
  if (days === 0) return <Chip tone="danger">Today</Chip>;
  if (days <= 3) return <Chip tone="danger">{days}d left</Chip>;
  if (days <= 10) return <Chip tone="warn">{days}d left</Chip>;
  return <Chip>{days}d left</Chip>;
}

/** Sand column of stacked date tiles. */
export function DuePanel({ dues, hasTan }: { dues: HomeData["dues"]; hasTan: boolean }) {
  return (
    <section aria-labelledby="due-title" className="rounded-[var(--radius-card)] bg-sand p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="due-title" className="text-xl">Due <em className="text-gold">dates</em></h2>
        <Link href="/gst#calendar" className="text-xs font-medium text-gold hover:underline">See all</Link>
      </div>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
        {dues.length === 0 && <li className="rounded-2xl bg-card p-4 text-sm text-ink-2">Nothing pending. Enjoy the quiet.</li>}
        {dues.map((d) => (
          <li key={d.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-hairline bg-card p-3 transition-shadow duration-200 hover:shadow-[var(--shadow-card)]">
            <div className="grid w-12 shrink-0 place-items-center rounded-xl bg-cream py-1.5 text-center">
              <span className="smallcaps text-[10px] text-gold">{monthShort(d.dueOn)}</span>
              <span className="money text-xl leading-none text-ink">{d.dueOn.getUTCDate()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{d.title}</p>
              <p className="line-clamp-2 text-xs text-ink-2">
                {d.extra ? d.extra.replace(/(\d+)$/, (m) => inr(Number(m))) : d.subtitle}
              </p>
            </div>
            {daysChip(d.daysLeft)}
          </li>
        ))}
      </ul>
      {!hasTan && (
        <Link href="/settings" className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-gold/60 p-3 text-sm text-gold transition-colors duration-200 hover:bg-card">
          <Plus className="size-4" /> Add TAN to get TDS deposit &amp; return reminders
        </Link>
      )}
      <p className="mt-4 text-[11px] text-ink-3">Standard dates — check for extensions.</p>
    </section>
  );
}
