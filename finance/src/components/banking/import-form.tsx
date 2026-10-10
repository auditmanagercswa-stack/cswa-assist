"use client";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { autoMatchAction, importStatementAction } from "@/app/actions/banking";

export function ImportForm({ ledgerId }: { ledgerId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <input ref={ref} type="file" accept=".csv,.xlsx,text/csv" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]; if (!f) return;
        const form = new FormData(); form.set("file", f); form.set("ledgerId", ledgerId);
        start(async () => {
          const r = await importStatementAction(form);
          if (ref.current) ref.current.value = "";
          if (!r.ok) return void toast.error(r.error);
          toast.success(`Imported ${r.data.imported} lines (${r.data.duplicates} already there) · ${r.data.matched} matched automatically`);
        });
      }} />
      <Button variant="outline" disabled={pending} onClick={() => ref.current?.click()}><Upload /> Import statement</Button>
      <Button variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await autoMatchAction(ledgerId); if (r.ok) toast.success(`${r.data.matched} matched`); else toast.error(r.error); })}><Wand2 /> Auto-match</Button>
    </div>
  );
}
