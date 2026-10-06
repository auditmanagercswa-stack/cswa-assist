"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

function OtpBox({ purpose, label, target, verified }: { purpose: "EMAIL_VERIFY" | "PHONE_VERIFY"; label: string; target: string; verified: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [dev, setDev] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    const { data, error } = await api<{ devCode: string | null }>("/api/auth/verify/resend", { body: { purpose } });
    if (error) return push({ tone: "error", title: error.message });
    setDev(data?.devCode ?? null);
    push({ tone: "success", title: `Code sent to your ${label.toLowerCase()}` });
  }
  async function verify() {
    setBusy(true);
    setErr(null);
    const { error } = await api("/api/auth/verify", { body: { purpose, code } });
    setBusy(false);
    if (error) return setErr(error.details?.fields?.code ?? error.message);
    push({ tone: "success", title: `${label} verified` });
    router.refresh();
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] font-semibold text-slate-500">{label}</div>
          <div className="font-semibold text-ink-900">{target}</div>
        </div>
        {verified ? <span className="flex items-center gap-1 text-sm font-semibold text-verified-600"><CheckCircle2 className="h-4 w-4" />Verified</span> : <Button size="sm" variant="outline" onClick={send}>Send code</Button>}
      </div>
      {!verified && (
        <div className="mt-4">
          <div className="flex gap-2">
            <Input inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label={`${label} code`} />
            <Button onClick={verify} loading={busy} disabled={code.length !== 6}>Verify</Button>
          </div>
          {err && <p className="mt-1 text-[12px] text-red-600">{err}</p>}
          {dev && <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[12px] text-amber-800">Development mode — your code is <b>{dev}</b></p>}
        </div>
      )}
    </div>
  );
}

export function VerifyForms({ email, phone, emailVerified, phoneVerified }: { email: string; phone: string; emailVerified: boolean; phoneVerified: boolean }) {
  return (
    <div className="mt-6 space-y-4">
      <OtpBox purpose="EMAIL_VERIFY" label="Email" target={email} verified={emailVerified} />
      <OtpBox purpose="PHONE_VERIFY" label="Mobile" target={`+91 ${phone}`} verified={phoneVerified} />
      <p className="text-[12.5px] text-slate-500">SMS delivery requires an SMS provider; until one is configured, mobile codes are logged on the server in development.</p>
      <ButtonLink href="/dashboard" variant="dark" block>Continue to dashboard</ButtonLink>
    </div>
  );
}
