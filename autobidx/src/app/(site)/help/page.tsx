import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { listFaqs, listHelp, LEGAL_PAGES } from "@/server/services/cms";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Help centre", alternates: { canonical: "/help" } };

export default async function HelpPage() {
  const [articles, faqs, s] = await Promise.all([listHelp(), listFaqs(), getSettings(["platform.supportEmail", "platform.supportPhone"])]);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-[32px] font-bold text-ink-900">Help centre</h1>
      <p className="mt-1 text-slate-500">Guides for buying, selling and getting verified. Can&apos;t find an answer? Email {s["platform.supportEmail"]} or call {s["platform.supportPhone"]}.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {articles.map((a) => (
          <Link key={a.slug} href={`/pages/${a.slug}`} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 hover:border-ink-900">
            <BookOpen className="mt-0.5 h-5 w-5 text-ignite-600" /><span className="font-semibold text-ink-900">{a.title}</span>
          </Link>
        ))}
      </div>
      <h2 className="mt-12 text-2xl font-bold text-ink-900">FAQs</h2>
      <div className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        {faqs.map((f) => (
          <details key={f.id} className="px-5 py-4">
            <summary className="cursor-pointer font-semibold text-ink-900">{f.question}</summary>
            <p className="mt-2 text-[14.5px] text-slate-600">{f.answer}</p>
          </details>
        ))}
      </div>
      <h2 className="mt-12 text-2xl font-bold text-ink-900">Policies</h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {LEGAL_PAGES.map((p) => <Link key={p.slug} href={`/pages/${p.slug}`} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] font-semibold text-ink-900 hover:border-ink-900">{p.title}<ChevronRight className="h-4 w-4 text-slate-400" /></Link>)}
      </div>
    </div>
  );
}
