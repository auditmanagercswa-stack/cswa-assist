import { prisma } from "@/lib/db";
import { AppError, forbidden, notFound } from "@/lib/errors";
import type { Actor } from "../auth/rbac";
import { can } from "../auth/rbac";
import { audit } from "../audit";

export const LEGAL_PAGES = [
  { slug: "terms", title: "Terms & Conditions" },
  { slug: "privacy", title: "Privacy Policy" },
  { slug: "dealer-agreement", title: "Dealer Agreement" },
  { slug: "buyer-agreement", title: "Buyer Agreement" },
  { slug: "refund-policy", title: "Refund Policy" },
  { slug: "auction-rules", title: "Auction Rules" },
  { slug: "fee-policy", title: "Fee Policy" },
  { slug: "cookie-policy", title: "Cookie Policy" },
];

export const getPage = (slug: string) => prisma.cmsPage.findFirst({ where: { slug, published: true } });
export const listHelp = () => prisma.cmsPage.findMany({ where: { category: "HELP", published: true }, orderBy: { title: "asc" }, select: { slug: true, title: true } });
export const listFaqs = (category?: string) => prisma.faq.findMany({ where: { published: true, ...(category ? { category } : {}) }, orderBy: { sortOrder: "asc" } });
export const listBanners = (placement: string) =>
  prisma.banner.findMany({
    where: { placement, active: true, OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }] },
    orderBy: { sortOrder: "asc" },
  });
export const listTestimonials = () => prisma.testimonial.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" }, take: 6 });

function guard(actor: Actor) {
  if (!can(actor, "content.manage")) throw forbidden();
}

export async function savePage(actor: Actor, input: { id?: string; slug: string; title: string; category: string; body: string; published: boolean }) {
  guard(actor);
  if (!/^[a-z0-9-]{2,60}$/.test(input.slug)) throw new AppError("VALIDATION", "Slug may contain lowercase letters, numbers and dashes.");
  const before = input.id ? await prisma.cmsPage.findUnique({ where: { id: input.id } }) : null;
  const page = input.id
    ? await prisma.cmsPage.update({ where: { id: input.id }, data: { ...input, id: undefined, updatedById: actor.userId } })
    : await prisma.cmsPage.create({ data: { slug: input.slug, title: input.title, category: input.category, body: input.body, published: input.published, updatedById: actor.userId } });
  await audit({ userId: actor.userId, action: input.id ? "cms.page_update" : "cms.page_create", entityType: "CmsPage", entityId: page.id, before: before ? { title: before.title, published: before.published } : undefined, after: { title: page.title, published: page.published } });
  return page;
}

export async function saveFaq(actor: Actor, input: { id?: string; question: string; answer: string; category: string; sortOrder: number; published: boolean }) {
  guard(actor);
  const faq = input.id ? await prisma.faq.update({ where: { id: input.id }, data: { ...input, id: undefined } }) : await prisma.faq.create({ data: { ...input, id: undefined } });
  await audit({ userId: actor.userId, action: "cms.faq_save", entityType: "Faq", entityId: faq.id });
  return faq;
}

export async function deleteFaq(actor: Actor, id: string) {
  guard(actor);
  await prisma.faq.delete({ where: { id } }).catch(() => {
    throw notFound();
  });
  await audit({ userId: actor.userId, action: "cms.faq_delete", entityType: "Faq", entityId: id });
}

export async function saveBanner(actor: Actor, input: { id?: string; placement: string; title: string; subtitle?: string | null; ctaLabel?: string | null; ctaHref?: string | null; active: boolean; sortOrder: number }) {
  guard(actor);
  if (input.ctaHref && !/^\/[^\s]*$|^https:\/\/[^\s]+$/.test(input.ctaHref)) throw new AppError("VALIDATION", "Links must be a site path (/vehicles) or https URL.");
  const b = input.id ? await prisma.banner.update({ where: { id: input.id }, data: { ...input, id: undefined } }) : await prisma.banner.create({ data: { ...input, id: undefined } });
  await audit({ userId: actor.userId, action: "cms.banner_save", entityType: "Banner", entityId: b.id });
  return b;
}

export async function deleteBanner(actor: Actor, id: string) {
  guard(actor);
  await prisma.banner.delete({ where: { id } });
  await audit({ userId: actor.userId, action: "cms.banner_delete", entityType: "Banner", entityId: id });
}
