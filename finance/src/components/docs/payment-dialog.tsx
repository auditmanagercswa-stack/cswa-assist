"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { inr } from "@/lib/format";
import { payBillAction, recordReceiptAction } from "@/app/actions/documents";

/** Record a customer receipt against an invoice, or pay a vendor bill. */
export function PaymentDialog({ mode, docId, outstanding, banks, trigger, title }: { mode: "receipt" | "payment"; docId: string; outstanding: number; banks: { id: string; name: string }[]; trigger: React.ReactNode; title: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={`Outstanding ${inr(outstanding)}`}>
        <form className="grid gap-3" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const amountPaise = Math.round(Number(f.get("amount")) * 100);
          const tdsPaise = Math.round(Number(f.get("tds") || 0) * 100);
          start(async () => {
            const base = { amountPaise, date: String(f.get("date")), bankLedgerId: String(f.get("bank")) };
            const r = mode === "receipt" ? await recordReceiptAction({ ...base, invoiceId: docId, tdsPaise }) : await payBillAction({ ...base, billId: docId });
            if (!r.ok) return void toast.error(r.error);
            toast.success(`Recorded ${r.data.number}`);
            setOpen(false);
          });
        }}>
          <div className="grid grid-cols-2 gap-3">
            <Label>Amount ₹<Input name="amount" inputMode="decimal" defaultValue={(outstanding / 100).toFixed(2)} required className="money" /></Label>
            <Label>Date<Input name="date" type="date" defaultValue={today} required /></Label>
          </div>
          <Label>{mode === "receipt" ? "Received into" : "Paid from"}<Select name="bank">{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Label>
          {mode === "receipt" && <Label>TDS deducted by customer ₹ (optional)<Input name="tds" inputMode="decimal" placeholder="0" className="money" /></Label>}
          <Button type="submit" disabled={pending}>{mode === "receipt" ? "Record receipt" : "Record payment"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
