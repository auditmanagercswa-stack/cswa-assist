import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getCtx } from "@/lib/session";
import { invoiceData } from "@/lib/invoice-data";
import { bankLedgers } from "@/lib/queries";
import { invoiceShareUrl } from "@/lib/share";
import { fmtDate, inr } from "@/lib/format";
import { todayUTC, daysBetween } from "@/lib/fy";
import { STATES } from "@/config/tax";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { DocStatusChip } from "@/components/docs/status";
import { InvoiceActions } from "@/components/docs/invoice-actions";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  const data = await invoiceData(ctx.company.id, (await params).id);
  if (!data) notFound();
  const { inv, pdf, outstanding, upi } = data;
  const banks = await bankLedgers(ctx.company.id);
  const share = invoiceShareUrl(inv.id);
  const msg = `Hello ${inv.party.name}, here is invoice ${inv.number} from ${ctx.company.name} for ${inr(pdf.invoice.total)}, due on ${fmtDate(inv.dueDate)}.\n\nView / download: ${share}${upi ? `\nPay by UPI: ${upi}` : ""}\n\nThank you!`;
  const phone = (inv.party.phone ?? "").replace(/\D/g, "");
  const whatsapp = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  const mailto = `mailto:${inv.party.email ?? ""}?subject=${encodeURIComponent(`Invoice ${inv.number} from ${ctx.company.name}`)}&body=${encodeURIComponent(msg)}`;

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/invoices" className="text-xs text-gold hover:underline">← Invoices</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl">{inv.number} <DocStatusChip status={inv.status} overdue={outstanding > 0 ? daysBetween(inv.dueDate, todayUTC()) : undefined} /></h1>
        </div>
        <InvoiceActions id={inv.id} canWrite={ctx.role !== "AUDITOR"} outstanding={outstanding} banks={banks} whatsapp={whatsapp} mailto={mailto} shareUrl={share} cancellable={inv.status !== "CANCELLED" && outstanding === pdf.invoice.total} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap justify-between gap-6 bg-forest p-6 text-on-forest">
          <div>
            <p className="font-display text-2xl">{ctx.company.name}</p>
            <p className="mt-1 max-w-sm text-sm text-on-forest/70">{ctx.company.address}</p>
            <p className="mt-1 text-sm text-on-forest/70">{ctx.company.gstin ? `GSTIN ${ctx.company.gstin}` : "Not GST registered"}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl italic text-gold-light">Tax Invoice</p>
            <p className="mt-1 text-sm">Date {fmtDate(inv.date)} · Due {fmtDate(inv.dueDate)}</p>
          </div>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <div><p className="smallcaps text-ink-3">Bill to</p><p className="mt-1 font-semibold">{inv.party.name}</p><p className="text-sm text-ink-2">{inv.party.gstin ? `GSTIN ${inv.party.gstin}` : "Unregistered (B2C)"}</p></div>
          <div><p className="smallcaps text-ink-3">Place of supply</p><p className="mt-1">{inv.placeOfSupply} · {STATES[inv.placeOfSupply]}</p><Chip className="mt-1">{inv.interState ? "Inter-state · IGST" : "Intra-state · CGST + SGST"}</Chip></div>
        </div>
        <div className="overflow-x-auto px-6">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="smallcaps text-left text-ink-3"><th className="py-2 font-medium">Item</th><th className="font-medium">HSN/SAC</th><th className="text-right font-medium">Qty</th><th className="text-right font-medium">Rate</th><th className="text-right font-medium">GST</th><th className="text-right font-medium">Taxable</th></tr></thead>
            <tbody>{pdf.items.map((i, k) => <tr key={k} className="border-t border-hairline"><td className="py-2">{i.description}</td><td>{i.hsn ?? "—"}</td><td className="money text-right">{i.qty} {i.unit}</td><td className="money text-right">{inr(i.rate)}</td><td className="text-right">{i.gstRate}%</td><td className="money text-right">{inr(i.taxable)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_280px]">
          <div className="grid content-start gap-3 text-sm">
            <p className="text-ink-2">{pdf.amountInWords}</p>
            {pdf.qrDataUrl && (
              <div className="flex items-center gap-3 rounded-2xl bg-sand p-3">
                <Image src={pdf.qrDataUrl} alt={`UPI QR code to pay ${inr(outstanding)}`} width={96} height={96} unoptimized className="rounded-lg bg-white" />
                <div><p className="font-semibold">Scan to pay {inr(outstanding)}</p><p className="text-xs text-ink-2">{ctx.company.upiId}</p></div>
              </div>
            )}
            {inv.allocations.length > 0 && (
              <div><p className="smallcaps mb-1 text-ink-3">Payments</p>{inv.allocations.map((a) => <p key={a.id} className="text-ink-2"><Link className="hover:underline" href={`/vouchers/${a.voucherId}`}>{a.voucher.number}</Link> · {fmtDate(a.voucher.date)} · <span className="money">{inr(Number(a.amountPaise))}</span></p>)}</div>
            )}
          </div>
          <dl className="grid h-fit gap-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-ink-2">Taxable value</dt><dd className="money">{inr(pdf.invoice.taxable)}</dd></div>
            {inv.interState ? <div className="flex justify-between"><dt className="text-ink-2">IGST</dt><dd className="money">{inr(pdf.invoice.igst)}</dd></div> : <>
              <div className="flex justify-between"><dt className="text-ink-2">CGST</dt><dd className="money">{inr(pdf.invoice.cgst)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">SGST</dt><dd className="money">{inr(pdf.invoice.sgst)}</dd></div></>}
            {pdf.invoice.roundOff !== 0 && <div className="flex justify-between"><dt className="text-ink-2">Round off</dt><dd className="money">{inr(pdf.invoice.roundOff, { decimals: true })}</dd></div>}
            <div className="flex justify-between border-t border-gold pt-2 text-base"><dt className="font-display">Total</dt><dd className="money text-lg">{inr(pdf.invoice.total)}</dd></div>
            {pdf.invoice.paid > 0 && <div className="flex justify-between text-ink-2"><dt>Balance due</dt><dd className="money">{inr(outstanding)}</dd></div>}
            <div className="mt-2 text-xs text-ink-3">e-Invoice IRN: {inv.irn ?? "not generated (IRP integration not enabled)"}</div>
            {inv.voucherId && <Link href={`/vouchers/${inv.voucherId}`} className="text-xs text-gold hover:underline">View sales voucher →</Link>}
          </dl>
        </div>
      </Card>
    </div>
  );
}
