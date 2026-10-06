import type { Prisma } from "@prisma/client";

/**
 * Search provider seam.
 * Today: Postgres trigram index on Vehicle.searchText (GIN gin_trgm_ops) — every token becomes a
 * LIKE '%token%' predicate that the index serves, combined with indexed structured filters.
 * At millions of listings, plug an external engine (OpenSearch / Meilisearch / Typesense) behind
 * `textFilter` by returning `{ id: { in: idsFromEngine } }` and index on the `vehicle.indexed` job.
 */
const SYNONYMS: Record<string, string> = {
  maruti: "maruti suzuki",
  merc: "mercedes",
  benz: "mercedes",
  vw: "volkswagen",
  automatic: "automatic",
  auto: "automatic",
  ev: "electric",
  tvm: "thiruvananthapuram",
  trivandrum: "thiruvananthapuram",
  cochin: "kochi",
  ernakulam: "ernakulam",
  calicut: "kozhikode",
};

export function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 6)
    .map((t) => SYNONYMS[t] ?? t);
}

export function textFilter(q: string | undefined | null): Prisma.VehicleWhereInput | null {
  if (!q) return null;
  const tokens = tokenize(q);
  if (!tokens.length) return null;
  return { AND: tokens.map((t) => ({ searchText: { contains: t } })) };
}
