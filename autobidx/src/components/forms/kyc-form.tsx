"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/form";
import { useToast } from "../ui/toast";
import { DocumentUploader } from "./document-uploader";

const DOC_LABELS: Record<string, string> = {
  PAN_CARD: "Business PAN card",
  GST_CERTIFICATE: "GST registration certificate",
  REGISTRATION_CERTIFICATE: "Shop & establishment / registration certificate",
  ADDRESS_PROOF: "Business address proof",
  CANCELLED_CHEQUE: "Cancelled cheque / bank statement",
  AUTHORIZED_ID: "Authorised person's ID (optional)",
};

export type KycInitial = {
  bankAccountName?: string | null;
  bankAccountLast4?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
  authorizedName?: string | null;
  authorizedDesignation?: string | null;
  authorizedPan?: string | null;
  authorizedPhone?: string | null;
  documents: { type: string; fileId: string; name?: string | null }[];
};

export function KycForm({ initial, required, locked, onSubmitted }: { initial: KycInitial | null; required: string[]; locked?: boolean; onSubmitted?: () => void }) {
  const router = useRouter();
  const { push } = useToast();
  const [f, setF] = useState({
    bankAccountName: initial?.bankAccountName ?? "",
    bankAccountNumber: "",
    bankIfsc: initial?.bankIfsc ?? "",
    bankName: initial?.bankName ?? "",
    authorizedName: initial?.authorizedName ?? "",
    authorizedDesignation: initial?.authorizedDesignation ?? "",
    authorizedPan: initial?.authorizedPan ?? "",
    authorizedPhone: initial?.authorizedPhone ?? "",
  });
  const [docs, setDocs] = useState<Record<string, { fileId: string; name?: string | null } | null>>(Object.fromEntries((initial?.documents ?? []).map((d) => [d.type, { fileId: d.fileId, name: d.name ?? "Uploaded document" }])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "save" | "submit">(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const docTypes = [...new Set([...required, "AUTHORIZED_ID"])];

  async function save(submit: boolean) {
    setErrors({});
    setBusy(submit ? "submit" : "save");
    const documents = Object.entries(docs).filter(([, v]) => v).map(([type, v]) => ({ type, fileId: v!.fileId }));
    const { error } = await api("/api/dealers/me/kyc", { method: "PUT", body: { ...f, documents, submit } });
    setBusy(null);
    if (error) {
      setErrors(error.details?.fields ?? {});
      if (initial?.bankAccountLast4 && error.details?.fields?.bankAccountNumber && !f.bankAccountNumber) push({ tone: "error", title: "Re-enter the full bank account number to save changes." });
      else push({ tone: "error", title: error.message });
      return;
    }
    push({ tone: "success", title: submit ? "KYC submitted for review" : "Draft saved" });
    if (submit) onSubmitted?.();
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section>
        <h3 className="font-sans text-[15px] font-bold text-ink-900">Bank account for payouts</h3>
        <p className="text-[13px] text-slate-500">Encrypted at rest. Seller payouts are sent only to this account.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Account holder name" error={errors.bankAccountName} required><Input value={f.bankAccountName} onChange={set("bankAccountName")} disabled={locked} /></Field>
          <Field label="Account number" error={errors.bankAccountNumber} required hint={initial?.bankAccountLast4 ? `On file: ••••${initial.bankAccountLast4} — re-enter to change` : undefined}><Input inputMode="numeric" value={f.bankAccountNumber} onChange={set("bankAccountNumber")} disabled={locked} autoComplete="off" /></Field>
          <Field label="IFSC" error={errors.bankIfsc} required><Input value={f.bankIfsc} onChange={(e) => setF((x) => ({ ...x, bankIfsc: e.target.value.toUpperCase() }))} disabled={locked} placeholder="FDRL0001234" /></Field>
          <Field label="Bank name" error={errors.bankName} required><Input value={f.bankName} onChange={set("bankName")} disabled={locked} /></Field>
        </div>
      </section>
      <section>
        <h3 className="font-sans text-[15px] font-bold text-ink-900">Authorised person</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={errors.authorizedName} required><Input value={f.authorizedName} onChange={set("authorizedName")} disabled={locked} /></Field>
          <Field label="Designation" error={errors.authorizedDesignation} required><Input value={f.authorizedDesignation} onChange={set("authorizedDesignation")} disabled={locked} placeholder="Proprietor / Director" /></Field>
          <Field label="PAN" error={errors.authorizedPan} required><Input value={f.authorizedPan} onChange={(e) => setF((x) => ({ ...x, authorizedPan: e.target.value.toUpperCase() }))} disabled={locked} placeholder="ABCDE1234F" /></Field>
          <Field label="Mobile" error={errors.authorizedPhone} required><Input inputMode="tel" value={f.authorizedPhone} onChange={set("authorizedPhone")} disabled={locked} /></Field>
        </div>
      </section>
      <section>
        <h3 className="font-sans text-[15px] font-bold text-ink-900">Documents</h3>
        <p className="text-[13px] text-slate-500">PDF or clear photos, up to 10 MB each. Stored privately — visible only to you and the verification team.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {docTypes.map((t) => (
            <DocumentUploader key={t} label={DOC_LABELS[t] ?? t} purpose="kyc" required={required.includes(t)} value={docs[t] ?? null} onChange={(v) => setDocs((d) => ({ ...d, [t]: v }))} />
          ))}
        </div>
      </section>
      {!locked && (
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <Button variant="outline" size="lg" onClick={() => save(false)} loading={busy === "save"}>Save draft</Button>
          <Button size="lg" onClick={() => save(true)} loading={busy === "submit"}><ShieldCheck className="h-5 w-5" />Submit for verification</Button>
        </div>
      )}
    </div>
  );
}
