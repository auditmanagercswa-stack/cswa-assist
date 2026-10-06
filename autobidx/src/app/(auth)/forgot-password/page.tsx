"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { message: string; devLink: string | null }>(null);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { data, error } = await api<{ message: string; devLink: string | null }>("/api/auth/forgot-password", { body: { email } });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(data!);
  }
  return (
    <div className="w-full max-w-md">
      <h1 className="text-[30px] font-bold text-ink-900">Reset your password</h1>
      {done ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <MailCheck className="mx-auto h-10 w-10 text-verified-500" />
          <p className="mt-3 text-sm text-slate-600">{done.message}</p>
          {done.devLink && <a href={done.devLink} className="mt-4 block break-all rounded-lg bg-amber-50 p-3 text-[12.5px] text-amber-800">Development mode — reset link: <span className="underline">{done.devLink}</span></a>}
          <Link href="/login" className="mt-4 inline-block text-sm font-semibold underline">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <p className="text-sm text-slate-500">Enter your account email and we&apos;ll send you a reset link valid for 30 minutes.</p>
          <Field label="Email" error={err ?? undefined}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
          <Button type="submit" size="lg" block loading={busy}>Send reset link</Button>
          <p className="text-center text-sm"><Link href="/login" className="font-semibold underline">Back to sign in</Link></p>
        </form>
      )}
    </div>
  );
}
