import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";

/** Reference data changes rarely — cache aggressively (revalidated on admin edits via tag). */
export const getMakes = unstable_cache(
  async () =>
    prisma.make.findMany({
      orderBy: [{ popular: "desc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, isLuxury: true, popular: true, _count: { select: { vehicles: { where: { status: { in: ["PUBLISHED", "AUCTION_LIVE"] } } } } } },
    }),
  ["catalog-makes"],
  { revalidate: 600, tags: ["catalog"] },
);

export const getModels = unstable_cache(
  async (makeId: string) => prisma.model.findMany({ where: { makeId }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, bodyType: true } }),
  ["catalog-models"],
  { revalidate: 600, tags: ["catalog"] },
);

export const getModelsBySlug = unstable_cache(
  async (makeSlug: string) => prisma.model.findMany({ where: { make: { slug: makeSlug } }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } }),
  ["catalog-models-slug"],
  { revalidate: 600, tags: ["catalog"] },
);

export const getVariants = unstable_cache(
  async (modelId: string) => prisma.variant.findMany({ where: { modelId }, orderBy: { name: "asc" }, select: { id: true, name: true, fuel: true, transmission: true } }),
  ["catalog-variants"],
  { revalidate: 600, tags: ["catalog"] },
);

export const getStates = unstable_cache(
  async () => prisma.state.findMany({ orderBy: [{ priority: "desc" }, { name: "asc" }], select: { id: true, name: true, slug: true, code: true } }),
  ["loc-states"],
  { revalidate: 3600, tags: ["locations"] },
);

export const getDistricts = unstable_cache(
  async (stateId: string) => prisma.district.findMany({ where: { stateId }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } }),
  ["loc-districts"],
  { revalidate: 3600, tags: ["locations"] },
);

export const getDistrictsByStateSlug = unstable_cache(
  async (stateSlug: string) => prisma.district.findMany({ where: { state: { slug: stateSlug } }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } }),
  ["loc-districts-slug"],
  { revalidate: 3600, tags: ["locations"] },
);

export const getCities = unstable_cache(
  async (districtId: string) => prisma.city.findMany({ where: { districtId }, orderBy: { name: "asc" }, select: { id: true, name: true, pincode: true } }),
  ["loc-cities"],
  { revalidate: 3600, tags: ["locations"] },
);
