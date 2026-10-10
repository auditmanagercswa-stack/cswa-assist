import { AccountingError } from "@/lib/accounting/post";
import { ForbiddenError } from "@/lib/roles";

export type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

/** Run a server action body and turn expected failures into friendly messages. */
export async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AccountingError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    console.error("[action]", e instanceof Error ? e.message : e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
