"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { amendVoucherAction, reverseVoucherAction } from "@/app/actions/documents";

/** Posted vouchers are immutable: "edit" = reverse + corrected copy; "reverse" needs a reason for the audit trail. */
export function VoucherActions({ id, amendable }: { id: string; amendable: boolean }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      {amendable && (
        <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          const r = await amendVoucherAction(id);
          if (!r.ok) return void toast.error(r.error);
          toast.success("Reversed. Edit the copy and post it.");
          router.push(`/?draft=${r.data.draftId}`);
        })}><PencilLine /> Amend</Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button variant="ghost" className="text-danger"><Undo2 /> Reverse</Button></DialogTrigger>
        <DialogContent title="Reverse this voucher" description="A mirror voucher is posted on the same date. Both stay in the books and the audit trail.">
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); const reason = String(new FormData(e.currentTarget).get("reason")); start(async () => { const r = await reverseVoucherAction(id, reason); if (!r.ok) return void toast.error(r.error); toast.success(`Reversed with ${r.data.number}`); setOpen(false); }); }}>
            <Label>Reason<Input name="reason" required minLength={3} placeholder="e.g. Entered twice" /></Label>
            <Button type="submit" variant="danger" disabled={pending}>Post reversal</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
