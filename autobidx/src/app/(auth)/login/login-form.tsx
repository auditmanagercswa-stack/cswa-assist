"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { safeNext } from "@/lib/slug";

export function LoginForm({ demo }: { demo: { role: string; email: string; password: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [identifier, setId] = useState("");
  const [password, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(sp.get("expired") ? "Your session expired. Please sign in again." : null);
  async function submit(e?: React.FormEvent, creds?: { email: string; password: string }) {
    e?.preventDefault();
    setBusy(true);
    setErr(null);
    const { data, error } = await api<{ next: string }>("/api/auth/login", { body: creds ? { identifier: creds.email, password: creds.password } : { identifier, password } });
    setBusy(false);
    if (error) return setErr(error.message);
    router.push(safeNext(sp.get("next"), data!.next));
    router.refresh();
  }
  return (
    <div className="w-full max-w-md">
      <h1 className="text-[30px] font-bold text-ink-900">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-500">Sign in to bid, buy and manage your dealership.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label="Email or mobile number" htmlFor="identifier">
          <Input id="identifier" name="identifier" autoComplete="username" value={identifier} onChange={(e) => setId(e.target.value)} required />
        </Field>
        <Field label={<span className="flex justify-between"><span>Password</span><Link href="/forgot-password" className="font-semibold text-ignite-600">Forgot?</Link></span>} htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPw(e.target.value)} required />
        </Field>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2.5 text-[13.5px] text-red-700" role="alert">{err}</div>}
        <Button type="submit" size="lg" block loading={busy}>Sign in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">New to AutoBidX? <Link href="/register" className="font-semibold text-ink-900 underline">Join as a dealer</Link></p>
      {demo.length > 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-4">
          <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-amber-700"><KeyRound className="h-4 w-4" />Demo accounts (development mode only)</div>
          <div className="mt-3 space-y-2">
            {demo.map((d) => (
              <button key={d.email} type="button" disabled={busy} onClick={() => submit(undefined, d)} className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-[13px] hover:border-amber-400">
                <span><b className="text-ink-900">{d.role}</b><span className="block text-slate-500">{d.email} · {d.password}</span></span>
                <span className="text-[12px] font-semibold text-ignite-600">Sign in →</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
