import Link from "next/link";
import { Users, UserPlus } from "lucide-react";
import { getCtx } from "@/lib/session";
import { db } from "@/lib/db";
import { mask } from "@/lib/format";
import { STATES } from "@/config/tax";
import { balancesByLedger } from "@/lib/party-balances";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { DataTable, EmptyState, PageTitle } from "@/components/ui/misc";
import { PartyDialog } from "@/components/docs/party-dialog";
import { inr } from "@/lib/format";

export const metadata = { title: "Parties" };

export default async function PartiesPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const ctx = await getCtx();
  const { kind } = await searchParams;
  const where = kind === "vendors" ? { kind: { in: ["VENDOR", "BOTH"] as ("VENDOR" | "BOTH")[] } } : kind === "customers" ? { kind: { in: ["CUSTOMER", "BOTH"] as ("CUSTOMER" | "BOTH")[] } } : {};
  const parties = await db.party.findMany({ where: { companyId: ctx.company.id, ...where }, orderBy: { name: "asc" } });
  const bal = await balancesByLedger(ctx.company.id, parties.map((p) => p.ledgerId));
  const tab = (k: string | undefined, label: string) => <Link href={k ? `/parties?kind=${k}` : "/parties"} className={"rounded-full px-4 py-1.5 text-sm " + (kind === k ? "bg-card text-ink shadow-sm" : "text-ink-2")}>{label}</Link>;
  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageTitle pre="Customers &" em="vendors" sub="GSTIN and PAN are format-checked. PAN is masked on screen."
        actions={ctx.role !== "AUDITOR" && <PartyDialog trigger={<Button><UserPlus /> Add party</Button>} />} />
      <div className="inline-flex w-fit rounded-full bg-sand p-1">{tab(undefined, "All")}{tab("customers", "Customers")}{tab("vendors", "Vendors")}</div>
      <Card>
        {parties.length === 0 ? <EmptyState icon={<Users />} title="No parties yet" body="Add customers and vendors so entries, invoices and bills land in the right accounts." /> : (
          <DataTable>
            <thead><tr><th>Name</th><th>GSTIN</th><th>PAN</th><th>State</th><th>Terms</th><th className="!text-right">Balance</th></tr></thead>
            <tbody>{parties.map((p) => {
              const b = bal.get(p.ledgerId) ?? 0;
              return (
                <tr key={p.id}>
                  <td><Link href={`/parties/${p.id}`} className="font-medium hover:text-gold">{p.name}</Link><span className="mt-0.5 block"><Chip>{p.kind.toLowerCase()}</Chip></span></td>
                  <td className="font-mono text-xs">{p.gstin ?? <Chip tone="warn">Missing</Chip>}</td>
                  <td className="font-mono text-xs">{p.pan ? mask(p.pan) : "—"}</td>
                  <td className="text-ink-2">{p.stateCode ? STATES[p.stateCode] : "—"}</td>
                  <td className="text-ink-2">{p.creditDays}d{p.tdsSection ? ` · TDS ${p.tdsSection}` : ""}</td>
                  <td className={"money text-right " + (b < 0 ? "text-ink-2" : "")}>{b === 0 ? "—" : `${inr(Math.abs(b), { round: true })} ${b > 0 ? "Dr" : "Cr"}`}</td>
                </tr>
              );
            })}</tbody>
          </DataTable>
        )}
      </Card>
    </div>
  );
}
