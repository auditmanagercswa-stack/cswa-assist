import { Download } from "lucide-react";
import { getCtx } from "@/lib/session";
import { fmtDate } from "@/lib/format";
import { ADAPTERS } from "@/lib/sync/tally";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { PageTitle } from "@/components/ui/misc";
import { TallyImport } from "@/components/settings/tally-import";

export const metadata = { title: "Tally sync" };

export default async function TallyPage() {
  const ctx = await getCtx();
  const c = ctx.company;
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <PageTitle pre="Sync with" em="Tally" sub={c.lastSyncAt ? `Last ${c.lastSyncSource ?? "Tally"} sync ${fmtDate(c.lastSyncAt)}` : "Not synced yet"} />
      <Card className="grid gap-4 p-5 md:p-6">
        <h2 className="text-xl">Export to Tally Prime</h2>
        <p className="text-sm text-ink-2">Download XML and import it in Tally: <i>Gateway of Tally → Import → Masters / Transactions</i>. Vouchers cover the selected period ({ctx.period.label}).</p>
        <div className="flex flex-wrap gap-2">
          {(["masters", "vouchers", "all"] as const).map((w) => <Button key={w} asChild variant={w === "all" ? "primary" : "outline"}><a href={`/api/sync/tally?what=${w}`}><Download /> {w === "all" ? "Masters + vouchers" : w[0].toUpperCase() + w.slice(1)}</a></Button>)}
        </div>
      </Card>
      {ctx.role !== "AUDITOR" && (
        <Card className="grid gap-4 p-5 md:p-6">
          <h2 className="text-xl">Import from Tally Prime</h2>
          <p className="text-sm text-ink-2">Export from Tally as XML (<i>Display → List of Accounts</i> or <i>Day Book</i> → Export → XML). Existing ledgers and already-imported vouchers are skipped, so re-importing is safe.</p>
          <TallyImport />
        </Card>
      )}
      <Card className="p-5 md:p-6">
        <h2 className="mb-3 text-xl">Sources</h2>
        <ul className="grid gap-2 text-sm">{ADAPTERS.map((a) => <li key={a.id} className="flex items-center justify-between">{a.label}<Chip tone={a.status === "available" ? "mint" : "neutral"}>{a.status === "available" ? "Available" : "Planned"}</Chip></li>)}</ul>
      </Card>
    </div>
  );
}
