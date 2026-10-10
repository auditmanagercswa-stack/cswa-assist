"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCtx } from "@/lib/session";
import { assertCanWrite } from "@/lib/roles";
import { AccountingError, writeAudit } from "@/lib/accounting/post";
import { attempt } from "./result";

export async function setFiledAction(dueDateId: string, filed: boolean) {
  return attempt(async () => {
    const ctx = await getCtx();
    assertCanWrite(ctx);
    const d = await db.dueDate.findFirst({ where: { id: dueDateId, companyId: ctx.company.id } });
    if (!d) throw new AccountingError("Due date not found.");
    await db.$transaction(async (t) => {
      await t.dueDate.update({ where: { id: d.id }, data: { status: filed ? "FILED" : "PENDING", filedAt: filed ? new Date() : null } });
      await writeAudit(t, ctx, filed ? "compliance.filed" : "compliance.reopened", "DueDate", d.id, { status: d.status }, { status: filed ? "FILED" : "PENDING" });
    });
    revalidatePath("/", "layout");
    return null;
  });
}
