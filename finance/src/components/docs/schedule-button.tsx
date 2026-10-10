"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { scheduleBillAction } from "@/app/actions/documents";

export function ScheduleButton({ billId, current }: { billId: string; current: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const save = (date: string | null) => start(async () => { const r = await scheduleBillAction(billId, date); if (!r.ok) return void toast.error(r.error); toast.success(date ? "Payment scheduled" : "Schedule cleared"); setOpen(false); });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost" aria-label="Schedule payment"><CalendarClock /></Button></DialogTrigger>
      <DialogContent title="Schedule payment" description="Plan when this bill gets paid. It shows on Payables until then.">
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save(String(new FormData(e.currentTarget).get("date"))); }}>
          <Label>Pay on<Input type="date" name="date" defaultValue={current ?? ""} required /></Label>
          <div className="flex gap-2"><Button type="submit" disabled={pending}>Save</Button>{current && <Button type="button" variant="ghost" onClick={() => save(null)}>Clear</Button>}</div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
