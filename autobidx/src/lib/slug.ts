export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function vehiclePath(v: { code: string; year: number; make: { slug: string }; model: { slug: string } }) {
  return `/cars/${v.make.slug}/${v.model.slug}/${v.year}/${v.code}`;
}

/** Only same-site relative paths are allowed as post-login redirects (blocks //host and /\host). */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
