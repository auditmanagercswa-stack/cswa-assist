import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { getCtx } from "@/lib/session";
import { db } from "@/lib/db";
import { ledgerStatement } from "@/lib/accounting/ledger";
import { fmtDate, inr, mask } from "@/lib/format";
import { STATES } from "@/config/tax";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, PageTitle } from "@/components/ui/misc";
import { PartyDialog } from "@/components/docs/party-dialog";

const drcr = (p: number) => `${inr(Math.abs(p))} ${p >= 0 ? "Dr" : "Cr"}`;

export default async function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  const party = await db.party.findFirst({ where: { id: (await params).id, companyId: ctx.company.id } });
  if (!party) notFound();
  const st = await ledgerStatement(ctx.company.id, party.ledgerId, ctx.period.from, ctx.period.to);
  if (!st) notFound();
  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <Link href="/parties" className="text-xs text-gold hover:underline">← Parties</Link>
      <PageTitle pre={party.name} sub={<>{party.gstin ? `GSTIN ${party.gstin}` : "No GSTIN"} · PAN {party.pan ? mask(party.pan) : "—"} · {party.stateCode ? STATES[party.stateCode] : "State not set"} · {party.creditDays} days credit{party.tdsSection ? ` · TDS ${party.tdsSection}` : ""}</>}
        actions={ctx.role !== "AUDITOR" && <PartyDialog edit={{ id: party.id, values: { name: party.name, kind: party.kind, gstin: party.gstin, pan: party.pan, stateCode: party.stateCode, email: party.email, phone: party.phone, address: party.address, creditDays: party.creditDays, tdsSection: party.tdsSection } }} trigger={<Button variant="outline"><Pencil /> Edit</Button>} />} />
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-6 pt-5">
          <h2 className="text-xl">Statement · {ctx.period.label}</h2>
          <span className="text-sm text-ink-2">Closing <b className="money text-ink">{drcr(st.closing)}</b></span>
        </div>
        <DataTable>
          <thead><tr><th>Date</th><th>Voucher</th><th>Particulars</th><th className="!text-right">Debit</th><th className="!text-right">Credit</th><th className="!text-right">Balance</th></tr></thead>
          <tbody>
            <tr><td colSpan={5} className="italic text-ink-2">Opening balance</td><td className="money text-right">{drcr(st.opening)}</td></tr>
            {st.rows.map((r, i) => (
              <tr key={i} className={r.reversed ? "text-ink-3" : ""}>
                <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                <td><Link href={`/vouchers/${r.id}`} className="hover:text-gold">{r.number}</Link></td>
                <td>{r.narration}<span className="block text-xs text-ink-3">{r.particulars}</span></td>
                <td className="money text-right">{r.dr ? inr(r.dr) : ""}</td>
                <td className="money text-right">{r.cr ? inr(r.cr) : ""}</td>
                <td className="money text-right">{drcr(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </div>
  );
}
