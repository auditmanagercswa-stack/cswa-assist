"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { RefreshCw, CalendarRange } from "lucide-react";
import { Select, Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { setCompanyAction, setFyAction, setPeriodAction } from "@/app/actions/prefs";
import { fyMonths } from "@/lib/fy";

export interface TopBarProps {
  companyName: string;
  section: string;
  companies: { id: string; name: string }[];
  companyId: string;
  fy: number;
  fyOptions: { value: number; label: string }[];
  periodKey: string;
  periodLabel: string;
}

/** Breadcrumb on the left; company, FY and period selectors plus Tally sync on the right. */
export function TopBar(p: TopBarProps) {
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState(false);
  const months = fyMonths(p.fy);
  const periodValue = p.periodKey.startsWith("c-") ? "custom" : p.periodKey;

  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-cream/90 px-4 py-3 backdrop-blur md:px-8">
      <nav aria-label="Breadcrumb" className="smallcaps flex min-w-0 items-center gap-2 text-ink-3">
        <span className="truncate font-semibold text-ink">{p.companyName}</span>
        <span aria-hidden>/</span>
        <span className="truncate">{p.section}</span>
      </nav>
      <div className={"flex flex-wrap items-center gap-2 " + (pending ? "opacity-60" : "")}>
        {p.companies.length > 1 && (
          <Select aria-label="Company" className="h-9 w-auto max-w-52 rounded-full text-xs" value={p.companyId}
            onChange={(e) => start(() => setCompanyAction(e.target.value))}>
            {p.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
        <Select aria-label="Financial year" className="h-9 w-auto rounded-full text-xs" value={p.fy}
          onChange={(e) => start(() => setFyAction(Number(e.target.value)))}>
          {p.fyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select aria-label="Period" className="h-9 w-auto rounded-full text-xs" value={periodValue}
          onChange={(e) => {
            if (e.target.value === "custom") return setCustom(true);
            start(() => setPeriodAction(e.target.value));
          }}>
          <option value="fy">Whole financial year</option>
          <optgroup label="Quarter">
            {[1, 2, 3, 4].map((q) => <option key={q} value={`q${q}`}>Quarter {q}</option>)}
          </optgroup>
          <optgroup label="Month">
            {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </optgroup>
          <option value="custom">{p.periodKey.startsWith("c-") ? p.periodLabel : "Custom…"}</option>
        </Select>
        <Button asChild variant="outline" size="sm" className="h-9">
          <Link href="/settings/tally"><RefreshCw /> Tally</Link>
        </Button>
      </div>

      <Dialog open={custom} onOpenChange={setCustom}>
        <DialogContent title="Custom period" description="Reports and the dashboard will use these dates.">
          <form className="grid gap-3" onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setCustom(false);
            start(() => setPeriodAction(`c-${f.get("from")}-${f.get("to")}`));
          }}>
            <div className="grid grid-cols-2 gap-3">
              <Label>From<Input type="date" name="from" required /></Label>
              <Label>To<Input type="date" name="to" required /></Label>
            </div>
            <Button type="submit"><CalendarRange /> Apply period</Button>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  );
}
