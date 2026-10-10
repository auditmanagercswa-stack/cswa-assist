"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCtx } from "@/lib/session";
import { assertOwner } from "@/lib/roles";
import { AccountingError, lockFy, unlockBooks, writeAudit } from "@/lib/accounting/post";
import { validateGstin, validatePan, validateTan, stateOfGstin } from "@/lib/accounting/core";
import { ensureDueDates } from "@/lib/company";
import { tallyAdapter } from "@/lib/sync/tally";
import { attempt } from "./result";

const Profile = z.object({
  name: z.string().trim().min(2).max(120), address: z.string().max(300).optional(), email: z.string().email().optional().or(z.literal("")), phone: z.string().max(20).optional(),
  gstin: z.string().trim().toUpperCase().optional().or(z.literal("")), pan: z.string().trim().toUpperCase().optional().or(z.literal("")), tan: z.string().trim().toUpperCase().optional().or(z.literal("")),
  stateCode: z.string().length(2), upiId: z.string().trim().max(60).optional().or(z.literal("")), pf: z.boolean(), pt: z.boolean(),
  legalType: z.enum(["PROPRIETORSHIP", "PARTNERSHIP", "LLP", "PRIVATE_LIMITED"]),
});
export async function saveProfileAction(input: z.input<typeof Profile>) {
  return attempt(async () => {
    const ctx = await getCtx();
    assertOwner(ctx);
    const p = Profile.parse(input);
    if (p.gstin && !validateGstin(p.gstin).ok) throw new AccountingError(`GSTIN: ${validateGstin(p.gstin).reason}`);
    if (p.pan && !validatePan(p.pan)) throw new AccountingError("PAN should look like ABCDE1234F.");
    if (p.tan && !validateTan(p.tan)) throw new AccountingError("TAN should look like PNEA12345B.");
    if (p.upiId && !/^[\w.\-]{2,}@[a-z]{2,}$/i.test(p.upiId)) throw new AccountingError("UPI ID should look like name@bank.");
    const data = { name: p.name, address: p.address || null, email: p.email || null, phone: p.phone || null, gstin: p.gstin || null, pan: p.pan || (p.gstin ? p.gstin.slice(2, 12) : null), tan: p.tan || null, stateCode: p.gstin ? stateOfGstin(p.gstin) : p.stateCode, upiId: p.upiId || null, legalType: p.legalType, flags: [...(p.pf ? ["pf"] : []), ...(p.pt ? ["pt"] : [])] };
    await db.$transaction(async (t) => {
      await t.company.update({ where: { id: ctx.company.id }, data });
      await writeAudit(t, ctx, "company.update", "Company", ctx.company.id, { gstin: ctx.company.gstin, tan: ctx.company.tan }, { gstin: data.gstin, tan: data.tan });
    });
    await ensureDueDates(db, ctx.company.id, ctx.fy);
    revalidatePath("/", "layout");
    return null;
  });
}

export async function lockFyAction(fy: number) {
  return attempt(async () => { await lockFy(await getCtx(), fy); revalidatePath("/settings"); return null; });
}
export async function unlockBooksAction() {
  return attempt(async () => { await unlockBooks(await getCtx()); revalidatePath("/settings"); return null; });
}

const Member = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email"), role: z.enum(["OWNER", "ACCOUNTANT", "AUDITOR"]) });
/** Invite by email: they sign in with a magic link and land in this company with the chosen role. */
export async function addMemberAction(input: z.input<typeof Member>) {
  return attempt(async () => {
    const ctx = await getCtx();
    assertOwner(ctx);
    const m = Member.parse(input);
    const user = await db.user.upsert({ where: { email: m.email }, create: { email: m.email }, update: {} });
    await db.membership.upsert({ where: { userId_companyId: { userId: user.id, companyId: ctx.company.id } }, create: { userId: user.id, companyId: ctx.company.id, role: m.role }, update: { role: m.role } });
    await db.$transaction((t) => writeAudit(t, ctx, "member.add", "Membership", user.id, undefined, { email: m.email, role: m.role }));
    revalidatePath("/settings");
    return null;
  });
}
export async function removeMemberAction(userId: string) {
  return attempt(async () => {
    const ctx = await getCtx();
    assertOwner(ctx);
    if (userId === ctx.user.id) throw new AccountingError("You can't remove yourself.");
    await db.membership.deleteMany({ where: { userId, companyId: ctx.company.id } });
    await db.$transaction((t) => writeAudit(t, ctx, "member.remove", "Membership", userId));
    revalidatePath("/settings");
    return null;
  });
}

export async function importTallyAction(form: FormData) {
  return attempt(async () => {
    const ctx = await getCtx();
    const f = form.get("file");
    if (!(f instanceof File) || !f.size) throw new AccountingError("Choose a Tally XML file.");
    if (f.size > 10 * 1024 * 1024) throw new AccountingError("File is over 10 MB — export a shorter period.");
    const text = await f.text();
    if (!text.includes("<ENVELOPE")) throw new AccountingError("This doesn't look like a Tally XML export.");
    const summary = await tallyAdapter.importData!(ctx, text);
    revalidatePath("/", "layout");
    return summary;
  });
}
