import Link from "next/link";
import { MessageCircle, Mail, BellRing } from "lucide-react";
import { getCtx } from "@/lib/session";
import { receivables, upiLink, bankLedgers } from "@/lib/queries";
import { invoiceShareUrl } from "@/lib/share";
import { fmtDate, inr } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState, PageTitle } from "@/components/ui/misc";
import { PaymentDialog } from "@/components/docs/payment-dialog";

export const metadata = { title: "Collect" };

/** One-tap reminders: WhatsApp deep link and email, each with the PDF link and a UPI payment link. */
export default async function CollectPage() {
  const ctx = await getCtx();
  const [r, banks] = await Promise.all([receivables(ctx.company.id), bankLedgers(ctx.company.id)]);
  const rows = [...r.rows].sort((a, b) => b.overdue - a.overdue);
  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <PageTitle pre="Collect" em="payments" sub="Overdue first. Each reminder carries the invoice link and a UPI payment link." />
      {!ctx.company.upiId && <p className="rounded-2xl bg-gold-soft p-3 text-sm text-gold">Add your UPI ID in <Link href="/settings" className="underline">Settings</Link> to include a pay-now link in reminders.</p>}
      {rows.length === 0 ? <Card><EmptyState icon={<BellRing />} title="Nothing to collect" body="All invoices are paid. Nice." /></Card> : (
        <ul className="grid gap-3">
          {rows.map((x) => {
            const upi = ctx.company.upiId ? upiLink(ctx.company.upiId, ctx.company.name, x.outstanding, `Invoice ${x.number}`) : null;
            const late = x.overdue > 0;
            const msg = `Hello ${x.party.name}, a gentle reminder that invoice ${x.number} for ${inr(x.outstanding)} ${late ? `was due on ${fmtDate(x.dueDate)} (${x.overdue} days ago)` : `is due on ${fmtDate(x.dueDate)}`}.\n\nInvoice: ${invoiceShareUrl(x.id)}${upi ? `\nPay by UPI: ${upi}` : ""}\n\nThank you — ${ctx.company.name}`;
            const wa = `https://wa.me/${(x.party.phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
            const mail = `mailto:${x.party.email ?? ""}?subject=${encodeURIComponent(`Payment reminder: ${x.number}`)}&body=${encodeURIComponent(msg)}`;
            return (
              <li key={x.id}>
                <Card className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">{x.party.name} {late ? <Chip tone={x.overdue > 60 ? "danger" : "warn"}>{x.overdue}d overdue</Chip> : <Chip>due {fmtDate(x.dueDate)}</Chip>}</p>
                    <p className="text-xs text-ink-3"><Link href={`/invoices/${x.id}`} className="hover:underline">{x.number}</Link> · {x.party.phone ? "WhatsApp ready" : "no phone on file"} · {x.party.email ?? "no email"}</p>
                  </div>
                  <span className="money text-xl">{inr(x.outstanding)}</span>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="gold"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a></Button>
                    <Button asChild size="sm" variant="outline"><a href={mail}><Mail /> Email</a></Button>
                    {ctx.role !== "AUDITOR" && <PaymentDialog mode="receipt" docId={x.id} outstanding={x.outstanding} banks={banks} title={`Payment from ${x.party.name}`} trigger={<Button size="sm" variant="ghost">Mark paid</Button>} />}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
