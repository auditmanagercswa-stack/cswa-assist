"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";

const opts = { path: "/", httpOnly: true, sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 365 };

/** Switch the active company — only to one the user is a member of. */
export async function setCompanyAction(companyId: string) {
  const user = await requireUser();
  const m = await db.membership.findFirst({ where: { userId: user.id, companyId } });
  if (!m) throw new Error("You don't have access to that company.");
  (await cookies()).set("cid", companyId, opts);
  revalidatePath("/", "layout");
}

export async function setFyAction(fy: number) {
  await requireUser();
  if (!Number.isInteger(fy) || fy < 2000 || fy > 2100) throw new Error("Invalid financial year");
  const c = await cookies();
  c.set("fy", String(fy), opts);
  c.set("period", "fy", opts);
  revalidatePath("/", "layout");
}

export async function setPeriodAction(key: string) {
  await requireUser();
  if (!/^(fy|q[1-4]|m-\d{4}-\d{2}|c-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2})$/.test(key)) throw new Error("Invalid period");
  (await cookies()).set("period", key, opts);
  revalidatePath("/", "layout");
}

export async function setThemeAction(theme: "light" | "dark") {
  (await cookies()).set("theme", theme === "dark" ? "dark" : "light", opts);
  revalidatePath("/", "layout");
}
