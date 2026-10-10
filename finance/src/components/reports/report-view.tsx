import Link from "next/link";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { Cell, ReportDoc } from "@/lib/reports/types";

function render(c: Cell, money?: boolean) {
  if (c == null) return "";
  if (typeof c === "number") return money ? inr(c) : String(c);
  if (typeof c === "string") return c;
  const body = c.money != null ? `${inr(c.money)} ${c.text}` : c.text;
  return c.href ? <Link href={c.href} className="hover:text-gold hover:underline">{body}</Link> : body;
}

export function ReportView({ doc }: { doc: ReportDoc }) {
  return (
    <div className="grid gap-5">
      {doc.kpis && (
        <div className="grid gap-3 sm:grid-cols-3">
          {doc.kpis.map((k) => (
            <Card key={k.label} className="p-4"><p className="text-xs text-ink-2">{k.label}</p><p className={cn("money mt-1 text-2xl", k.value < 0 && "text-danger")}>{inr(k.value, { round: true })}</p></Card>
          ))}
        </div>
      )}
      {doc.sections.map((s, i) => (
        <Card key={i} className="overflow-hidden">
          {s.heading && <h2 className="px-6 pt-5 text-lg">{s.heading}</h2>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr>{s.columns.map((c, j) => <th key={j} className={cn("smallcaps whitespace-nowrap px-4 py-3 font-medium text-ink-3", c.money || c.align === "right" ? "text-right" : "text-left")}>{c.label}</th>)}</tr></thead>
              <tbody>
                {s.rows.length === 0 && <tr><td colSpan={s.columns.length} className="px-4 py-8 text-center text-ink-2">Nothing in this period.</td></tr>}
                {s.rows.map((r, j) => (
                  <tr key={j} className={cn("border-t border-hairline", r.tone === "total" && "border-t-2 border-gold/60 bg-cream/70 font-semibold", r.tone === "subtotal" && "font-medium", r.tone === "heading" && "bg-sand/50", r.tone === "muted" && "text-ink-3")}>
                    {r.cells.map((c, k) => (
                      <td key={k} className={cn("px-4 py-2.5", s.columns[k]?.money || s.columns[k]?.align === "right" ? "money whitespace-nowrap text-right" : "", r.tone === "heading" && k === 0 && "font-display text-base text-ink")}>{render(c, s.columns[k]?.money)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      {doc.footnote && <p className="text-xs text-ink-3">{doc.footnote}</p>}
    </div>
  );
}
