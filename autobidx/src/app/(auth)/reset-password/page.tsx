"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

function ResetForm() {
  const sp = useSearchParams();
  const router = useRouter();
  const { push } = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const token = sp.get("token") ?? "";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setErr("Passwords don't match.");
    setBusy(true);
    const { error } = await api("/api/auth/reset-password", { body: { token, password: pw } });
    setBusy(false);
    if (error) return setErr(error.details?.fields?.password ?? error.message);
    push({ tone: "success", title: "Password updated", body: "Sign in with your new password." });
    router.push("/login");
  }
  if (!token) return <p className="mt-6 text-sm text-slate-600">This reset link is invalid. <Link href="/forgot-password" className="font-semibold underline">Request a new one</Link>.</p>;
  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <Field label="New password" hint="At least 8 characters with letters and numbers"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required /></Field>
      <Field label="Confirm password" error={err ?? undefined}><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required /></Field>
      <Button type="submit" size="lg" block loading={busy}>Update password</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-md">
      <h1 className="text-[30px] font-bold text-ink-900">Choose a new password</h1>
      <p className="mt-1 text-sm text-slate-500">You&apos;ll be signed out of all other devices.</p>
      <Suspense><ResetForm /></Suspense>
    </div>
  );
}
