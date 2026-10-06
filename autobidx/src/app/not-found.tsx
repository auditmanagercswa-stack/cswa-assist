import Link from "next/link";
import { CarFront } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ignite-50 text-ignite-600"><CarFront className="h-8 w-8" /></div>
        <h1 className="mt-5 text-3xl font-bold text-ink-900">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-slate-500">The vehicle may have been sold, or the link is out of date.</p>
        <div className="mt-6 flex gap-3">
          <Link href="/vehicles" className="inline-flex h-11 items-center rounded-lg bg-ignite-500 px-5 font-bold text-white">Browse vehicles</Link>
          <Link href="/" className="inline-flex h-11 items-center rounded-lg border border-slate-300 px-5 font-semibold">Home</Link>
        </div>
      </main>
    </>
  );
}
