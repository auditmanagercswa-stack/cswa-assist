import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { vehiclePath } from "@/lib/slug";

export const revalidate = 3600;

/**
 * Sitemap of public pages + live listings. At 1M+ listings, split into a sitemap index with
 * generateSitemaps() (50k URLs per file) — the query below is already keyset-friendly.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.appUrl;
  const [vehicles, dealers, pages] = await Promise.all([
    prisma.vehicle.findMany({ where: { status: { in: ["PUBLISHED", "AUCTION_LIVE"] } }, select: { code: true, year: true, updatedAt: true, make: { select: { slug: true } }, model: { select: { slug: true } } }, orderBy: { updatedAt: "desc" }, take: 45000 }),
    prisma.dealer.findMany({ where: { status: "VERIFIED" }, select: { slug: true, updatedAt: true }, take: 5000 }),
    prisma.cmsPage.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } }),
  ]);
  return [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/vehicles`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/auctions`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/dealers`, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/help`, changeFrequency: "weekly", priority: 0.4 },
    ...vehicles.map((v) => ({ url: `${base}${vehiclePath(v)}`, lastModified: v.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...dealers.map((d) => ({ url: `${base}/dealer/${d.slug}`, lastModified: d.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
    ...pages.map((p) => ({ url: `${base}/pages/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.3 })),
  ];
}
