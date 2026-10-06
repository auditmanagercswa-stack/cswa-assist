import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Column<T> = { key: string; header: ReactNode; cell: (row: T) => ReactNode; className?: string; hideOnMobile?: boolean; align?: "right" | "left" };

/** Responsive table: a real table on ≥md screens, stacked cards on mobile. */
export function DataTable<T>({ columns, rows, rowKey, empty, mobileTitle }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; empty?: ReactNode; mobileTitle?: (r: T) => ReactNode }) {
  if (!rows.length) return <>{empty}</>;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-white shadow-[var(--shadow-card)] md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70">
              {columns.map((c) => (
                <th key={c.key} className={cn("px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500", c.align === "right" && "text-right", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={rowKey(r)} className="hover:bg-slate-50/60">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3 align-middle text-slate-700", c.align === "right" && "text-right num", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <div key={rowKey(r)} className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]">
            {mobileTitle && <div className="mb-2 font-semibold text-ink-900">{mobileTitle(r)}</div>}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
              {columns
                .filter((c) => !c.hideOnMobile)
                .map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{c.header}</dt>
                    <dd className="mt-0.5 truncate text-slate-700">{c.cell(r)}</dd>
                  </div>
                ))}
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}
