"use server";
import { getCtx } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { AccountingError } from "@/lib/accounting/post";
import { askBooks } from "@/lib/ai/ask";
import { attempt } from "./result";

export async function askAction(question: string) {
  return attempt(async () => {
    const ctx = await getCtx();
    const q = question.trim().slice(0, 400);
    if (q.length < 3) throw new AccountingError("Ask a question about your books.");
    const r = rateLimit(`ask:${ctx.user.id}`, 20, 60_000);
    if (!r.ok) throw new AccountingError(`Too many questions — try again in ${r.retryInSec}s.`);
    return askBooks(ctx, q);
  });
}
