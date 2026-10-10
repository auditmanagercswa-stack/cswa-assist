"use client";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importTallyAction } from "@/app/actions/settings";
import type { ImportSummary } from "@/lib/sync/types";

export function TallyImport() {
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ImportSummary | null>(null);
  return (
    <div className="grid gap-3">
      <input ref={ref} type="file" accept=".xml,application/xml,text/xml" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]; if (!f) return;
        const form = new FormData(); form.set("file", f);
        start(async () => { const r = await importTallyAction(form); if (ref.current) ref.current.value = ""; if (!r.ok) return void toast.error(r.error); setRes(r.data); toast.success("Tally import finished"); });
      }} />
      <Button variant="outline" className="w-fit" disabled={pending} onClick={() => ref.current?.click()}><Upload /> {pending ? "Importing…" : "Import Tally XML"}</Button>
      {res && (
        <div className="rounded-2xl bg-sand p-3 text-sm">
          <p>{res.groups} groups, {res.ledgers} ledgers and {res.vouchers} vouchers imported · {res.skipped} already present.</p>
          {res.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-danger">{res.errors.slice(0, 10).map((e) => <li key={e}>{e}</li>)}{res.errors.length > 10 && <li>…and {res.errors.length - 10} more</li>}</ul>}
        </div>
      )}
    </div>
  );
}
