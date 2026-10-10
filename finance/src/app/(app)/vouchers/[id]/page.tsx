import Link from "next/link";
import { notFound } from "next/navigation";
import { getCtx } from "@/lib/session";
import { db, n } from "@/lib/db";
import { fmtDate, inr } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { DataTable } from "@/components/ui/misc";
import { VoucherActions } from "@/components/docs/voucher-actions";

const ACTION: Record<string, string> = { "voucher.draft": "Drafted", "voucher.post": "Posted", "voucher.reverse": "Reversed", "voucher.amend": "Amended", "voucher.discard": "Discarded" };

export default async function VoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  const id = (await params).id;
  const v = await db.voucher.findFirst({
    where: { id, companyId: ctx.company.id },
    include: { lines: { include: { ledger: true }, orderBy: { sortOrder: "asc" } }, party: true, reversalOf: true, reversedBy: true, invoice: true, bill: true },
  });
  if (!v) notFound();
  const trail = await db.auditLog.findMany({ where: { companyId: ctx.company.id, entity: "Voucher", entityId: { in: [v.id, ...(v.reversedBy ? [v.reversedBy.id] : [])] } }, include: { user: true }, orderBy: { at: "asc" } });
  const dr = v.lines.filter((l) => l.side === "DR").reduce((t, l) => t + n(l.amountPaise), 0);
  const tds = v.tds as { section?: string; amountPaise?: number } | null;
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="smallcaps text-ink-3">{v.type.replace("_", " ").toLowerCase()} voucher · {v.source.toLowerCase()}</p>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl">{v.number ?? "Draft"}
            {v.status === "POSTED" && !v.reversalOfId && <Chip tone="mint">Posted</Chip>}
            {v.status === "REVERSED" && <Chip tone="danger">Reversed</Chip>}
            {v.reversalOfId && <Chip tone="warn">Reversal</Chip>}
            {v.status === "DRAFT" && <Chip tone="warn">Draft</Chip>}
          </h1>
          <p className="mt-1 text-sm text-ink-2">{fmtDate(v.date)}{v.party ? ` · ${v.party.name}` : ""}</p>
        </div>
        {ctx.role !== "AUDITOR" && v.status === "POSTED" && !v.reversalOfId && <VoucherActions id={v.id} amendable={v.source !== "INVOICE" && v.source !== "BILL"} />}
      </div>
      {v.reversalOf && <p className="rounded-2xl bg-warn-bg p-3 text-sm text-warn">Reverses <Link className="underline" href={`/vouchers/${v.reversalOf.id}`}>{v.reversalOf.number}</Link>.</p>}
      {v.reversedBy && <p className="rounded-2xl bg-danger-bg p-3 text-sm text-danger">Reversed by <Link className="underline" href={`/vouchers/${v.reversedBy.id}`}>{v.reversedBy.number}</Link>.</p>}
      {v.invoice && <p className="text-sm">Posted from invoice <Link className="text-gold underline" href={`/invoices/${v.invoice.id}`}>{v.invoice.number}</Link>.</p>}
      <Card>
        <DataTable>
          <thead><tr><th>Ledger</th><th className="!text-right">Debit</th><th className="!text-right">Credit</th></tr></thead>
          <tbody>{v.lines.map((l) => (
            <tr key={l.id}><td><Link href={`/reports/ledger?ledger=${l.ledgerId}`} className="hover:text-gold">{l.side === "CR" && <span className="mr-2 text-ink-3">To</span>}{l.ledger.name}</Link></td>
              <td className="money text-right">{l.side === "DR" ? inr(n(l.amountPaise)) : ""}</td><td className="money text-right">{l.side === "CR" ? inr(n(l.amountPaise)) : ""}</td></tr>
          ))}
            <tr className="font-semibold"><td>Total</td><td className="money text-right">{inr(dr)}</td><td className="money text-right">{inr(dr)}</td></tr>
          </tbody>
        </DataTable>
        <div className="grid gap-1 px-6 pb-5 text-sm text-ink-2">
          {v.narration && <p><span className="text-ink-3">Narration:</span> {v.narration}</p>}
          {v.aiInput && <p><span className="text-ink-3">Recorded as:</span> “{v.aiInput}”{v.aiConfidence != null ? ` · ${Math.round(v.aiConfidence * 100)}% confidence` : ""}</p>}
          {tds?.section && <p><span className="text-ink-3">TDS:</span> {tds.section} · {inr(tds.amountPaise ?? 0)}</p>}
          {v.reverseCharge && <p>Reverse charge applies.</p>}
        </div>
      </Card>
      <Card className="p-6">
        <h2 className="mb-3 text-xl">Audit trail</h2>
        <ol className="grid gap-2 border-l border-hairline pl-4 text-sm">
          {trail.map((t) => (
            <li key={t.id} className="relative"><span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-gold" />
              <b>{ACTION[t.action] ?? t.action}</b> by {t.user?.name ?? t.user?.email ?? "system"} · <span className="text-ink-2">{t.at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</span>
              {t.action === "voucher.reverse" && t.after && typeof t.after === "object" && "reason" in t.after && <span className="block text-ink-2">Reason: {String((t.after as { reason: string }).reason)}</span>}
            </li>
          ))}
          {trail.length === 0 && <li className="text-ink-2">No audit entries (imported or seeded data).</li>}
        </ol>
      </Card>
    </div>
  );
}
