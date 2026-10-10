import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Company, Role } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { fyStartYear, resolvePeriod, todayUTC, type Period } from "@/lib/fy";

export { ForbiddenError, assertCanWrite, assertOwner } from "@/lib/roles";

export const requireUser = cache(async () => {
  const s = await auth();
  if (!s?.user?.id) redirect("/login");
  return { id: s.user.id, email: s.user.email ?? "", name: s.user.name ?? "" };
});

export interface Ctx {
  user: { id: string; email: string; name: string };
  company: Company;
  role: Role;
  companies: { id: string; name: string }[];
  fy: number;
  period: Period;
}

/**
 * The tenancy boundary. Resolves the signed-in user, the active company (cookie,
 * validated against memberships) and the FY/period. Every data access takes
 * `ctx.company.id` from here — never from client input.
 */
export const getCtx = cache(async (): Promise<Ctx> => {
  const user = await requireUser();
  const memberships = await db.membership.findMany({ where: { userId: user.id }, include: { company: true }, orderBy: { createdAt: "asc" } });
  if (!memberships.length) redirect("/onboarding");
  const jar = await cookies();
  const cid = jar.get("cid")?.value;
  const m = memberships.find((x) => x.companyId === cid) ?? memberships[0];
  const fyCookie = Number(jar.get("fy")?.value);
  const fy = Number.isInteger(fyCookie) && fyCookie > 2000 ? fyCookie : fyStartYear(todayUTC());
  return {
    user,
    company: m.company,
    role: m.role,
    companies: memberships.map((x) => ({ id: x.company.id, name: x.company.name })),
    fy,
    period: resolvePeriod(fy, jar.get("period")?.value),
  };
});

