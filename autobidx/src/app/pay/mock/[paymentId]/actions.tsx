"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export function MockGatewayActions({ paymentId, back }: { paymentId: string; back: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "success" | "failure">(null);
  const [err, setErr] = useState<string | null>(null);
  async function run(outcome: "success" | "failure") {
    setBusy(outcome);
    const { data, error } = await api<{ status: string }>("/api/payments/mock/simulate", { body: { paymentId, outcome } });
    setBusy(null);
    if (error) return setErr(error.message);
    router.push(`${back}${back.includes("?") ? "&" : "?"}payment=${data!.status.toLowerCase()}`);
    router.refresh();
  }
  return (
    <div className="space-y-2 pt-2">
      {err && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</div>}
      <button onClick={() => run("success")} disabled={!!busy} className="h-12 w-full rounded-lg bg-emerald-600 font-bold text-white hover:bg-emerald-700 disabled:opacity-60">{busy === "success" ? "Processing…" : "Simulate successful payment"}</button>
      <button onClick={() => run("failure")} disabled={!!busy} className="h-11 w-full rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{busy === "failure" ? "Processing…" : "Simulate failed payment"}</button>
      <a href={back} className="block pt-1 text-center text-[13px] text-slate-500 underline">Cancel and return</a>
    </div>
  );
}
