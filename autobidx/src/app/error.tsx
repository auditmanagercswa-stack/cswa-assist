"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/** Friendly error boundary — never shows stack traces to users. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600"><AlertTriangle className="h-8 w-8" /></div>
      <h1 className="mt-5 text-3xl font-bold text-ink-900">Something went wrong</h1>
      <p className="mt-2 text-slate-500">Please try again. If the problem continues, contact support{error.digest ? ` with reference ${error.digest}` : ""}.</p>
      <div className="mt-6 flex gap-3">
        <button onClick={reset} className="inline-flex h-11 items-center rounded-lg bg-ink-900 px-5 font-bold text-white">Try again</button>
        <Link href="/" className="inline-flex h-11 items-center rounded-lg border border-slate-300 px-5 font-semibold">Home</Link>
      </div>
    </main>
  );
}
