import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/format";
import { getPage, LEGAL_PAGES } from "@/server/services/cms";
import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/cn";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getPage((await params).slug);
  return p ? { title: p.title, alternates: { canonical: `/pages/${p.slug}` } } : { title: "Page not found" };
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) notFound();
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[220px_1fr]">
      {page.category === "LEGAL" && (
        <nav className="hidden lg:block" aria-label="Policies">
          <div className="sticky top-24 space-y-1">
            {LEGAL_PAGES.map((p) => (
              <Link key={p.slug} href={`/pages/${p.slug}`} className={cn("block rounded-lg px-3 py-2 text-[14px]", p.slug === slug ? "bg-ink-900 font-semibold text-white" : "text-slate-600 hover:bg-white")}>{p.title}</Link>
            ))}
          </div>
        </nav>
      )}
      <article className={cn("rounded-2xl border border-slate-200 bg-white p-6 sm:p-10", page.category !== "LEGAL" && "lg:col-span-2")}>
        <div className="text-[12px] font-bold uppercase tracking-wider text-ignite-600">{page.category === "LEGAL" ? "Policy" : "Help centre"}</div>
        <h1 className="mt-1 text-[30px] font-bold text-ink-900">{page.title}</h1>
        <p className="mt-1 text-[13px] text-slate-500">Last updated {formatDate(page.updatedAt)}</p>
        <div className="mt-6"><Markdown source={page.body} /></div>
      </article>
    </div>
  );
}
