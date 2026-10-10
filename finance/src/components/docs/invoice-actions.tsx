"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Download, MessageCircle, Mail, IndianRupee, Ban, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelInvoiceAction } from "@/app/actions/documents";
import { PaymentDialog } from "./payment-dialog";

export function InvoiceActions({ id, canWrite, outstanding, banks, whatsapp, mailto, shareUrl, cancellable }: { id: string; canWrite: boolean; outstanding: number; banks: { id: string; name: string }[]; whatsapp: string; mailto: string; shareUrl: string; cancellable: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline"><a href={`/api/invoices/${id}/pdf`} target="_blank" rel="noreferrer"><Download /> PDF</a></Button>
      <Button asChild variant="outline"><a href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a></Button>
      <Button asChild variant="outline"><a href={mailto}><Mail /> Email</a></Button>
      <Button variant="ghost" onClick={() => navigator.clipboard.writeText(shareUrl).then(() => toast.success("Share link copied"), () => toast.error("Couldn't copy — select the link instead"))}><Copy /> Copy link</Button>
      {canWrite && outstanding > 0 && <PaymentDialog mode="receipt" docId={id} outstanding={outstanding} banks={banks} title="Record payment received" trigger={<Button><IndianRupee /> Record payment</Button>} />}
      {canWrite && cancellable && (
        <Button variant="ghost" className="text-danger" disabled={pending} onClick={() => start(async () => {
          const r = await cancelInvoiceAction(id);
          if (r.ok) toast.success("Invoice cancelled — sales voucher reversed"); else toast.error(r.error);
        })}><Ban /> Cancel invoice</Button>
      )}
    </div>
  );
}
