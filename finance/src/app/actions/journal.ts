"use server";
import { revalidatePath } from "next/cache";
import { Prisma, type VoucherType } from "@prisma/client";
import { z } from "zod";
import { db, n } from "@/lib/db";
import { getCtx, type Ctx } from "@/lib/session";
import { assertCanWrite } from "@/lib/roles";
import { rateLimit } from "@/lib/rate-limit";
import { AccountingError, createDraft, deleteDraft, postVoucher, reverseVoucher } from "@/lib/accounting/post";
import { draftFromImage, draftFromText, learnFromCorrection } from "@/lib/ai/journal";
import { aiEnabled } from "@/lib/ai/client";
import type { ResolvedDraft } from "@/lib/ai/schema";
import { attempt } from "./result";

export interface DraftView extends ResolvedDraft { voucherId: string; input: string }

function limit(ctx: Ctx) {
  const r = rateLimit(`ai:${ctx.user.id}`, 20, 60_000);
  if (!r.ok) throw new AccountingError(`You're drafting quickly — try again in ${r.retryInSec}s.`);
}

async function saveDraft(ctx: Ctx, d: ResolvedDraft, input: string, source: "CHAT" | "OCR", replaceId?: string): Promise<DraftView> {
  const data = {
    type: d.voucherType as VoucherType, date: new Date(d.date + "T00:00:00Z"), narration: d.narration, partyId: d.partyId, source,
    tds: d.tds ? { section: d.tds.section, rate: d.tds.rate, amountPaise: d.tds.amountPaise } : undefined,
    aiInput: input, aiConfidence: d.confidence, aiDraft: JSON.parse(JSON.stringify(d)) as Prisma.InputJsonValue,
    lines: d.lines.map((l) => ({ ledgerId: l.ledgerId, side: l.side, amountPaise: l.amountPaise })),
  };
  if (replaceId) {
    await db.$transaction(async (t) => {
      const v = await t.voucher.findFirst({ where: { id: replaceId, companyId: ctx.company.id, status: "DRAFT" } });
      if (!v) throw new AccountingError("Draft not found.");
      await t.voucherLine.deleteMany({ where: { voucherId: v.id } });
      await t.voucher.update({
        where: { id: v.id },
        data: { type: data.type, date: data.date, narration: data.narration, partyId: data.partyId, tds: data.tds ?? Prisma.JsonNull, aiInput: input, aiConfidence: d.confidence, aiDraft: data.aiDraft,
          lines: { create: data.lines.map((l, i) => ({ ...l, amountPaise: BigInt(l.amountPaise), sortOrder: i })) } },
      });
    });
    return { ...d, voucherId: replaceId, input };
  }
  const v = await createDraft(ctx, data);
  return { ...d, voucherId: v.id, input };
}

/** Sentence → saved draft (never posted). */
export async function draftEntryAction(text: string) {
  return attempt(async () => {
    const ctx = await getCtx();
    assertCanWrite(ctx);
    const clean = text.trim().slice(0, 600);
    if (clean.length < 4) throw new AccountingError("Describe what happened, e.g. “Paid office rent ₹25,000 from HDFC”.");
    limit(ctx);
    const view = await saveDraft(ctx, await draftFromText(ctx, clean), clean, "CHAT");
    revalidatePath("/");
    return view;
  });
}

/** Answer the inline clarifying question; the draft is re-done with the extra context. */
export async function clarifyDraftAction(voucherId: string, answer: string) {
  return attempt(async () => {
    const ctx = await getCtx();
    assertCanWrite(ctx);
    limit(ctx);
    const v = await db.voucher.findFirst({ where: { id: voucherId, companyId: ctx.company.id, status: "DRAFT" } });
    if (!v) throw new AccountingError("Draft not found.");
    const input = `${v.aiInput ?? v.narration ?? ""}. ${answer.trim()}`.slice(0, 800);
    const view = await saveDraft(ctx, await draftFromText(ctx, input), input, v.source === "OCR" ? "OCR" : "CHAT", v.id);
    revalidatePath("/");
    return view;
  });
}

const MAX_IMAGE = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** Bill / receipt photo → OCR → draft. */
export async function ocrDraftAction(form: FormData) {
  return attempt(async () => {
    const ctx = await getCtx();
    assertCanWrite(ctx);
    if (!aiEnabled()) throw new AccountingError("Reading receipts needs an Anthropic API key. Add ANTHROPIC_API_KEY to .env, or type the entry instead.");
    limit(ctx);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AccountingError("Choose a photo of the bill.");
    if (file.size > MAX_IMAGE) throw new AccountingError("That image is over 5 MB — try a smaller photo.");
    const type = TYPES.find((t) => t === file.type);
    if (!type) throw new AccountingError("Use a JPG, PNG, WebP or GIF image.");
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    const d = await draftFromImage(ctx, { data, mediaType: type }, String(form.get("note") ?? ""));
    const view = await saveDraft(ctx, d, `Photo: ${file.name}`, "OCR");
    revalidatePath("/");
    return view;
  });
}

const EditSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["PAYMENT", "RECEIPT", "JOURNAL", "SALES", "PURCHASE", "CONTRA"]),
  narration: z.string().max(300),
  lines: z.array(z.object({ ledgerId: z.string().min(1), side: z.enum(["DR", "CR"]), amountPaise: z.number().int().positive() })).min(2).max(20),
});

/** Save the user's edits to a draft and (optionally) post it. Corrections teach the drafter. */
export async function confirmDraftAction(voucherId: string, edits: z.infer<typeof EditSchema>, post = true) {
  return attempt(async () => {
    const ctx = await getCtx();
    assertCanWrite(ctx);
    const e = EditSchema.parse(edits);
    const v = await db.voucher.findFirst({ where: { id: voucherId, companyId: ctx.company.id, status: "DRAFT" }, include: { lines: true } });
    if (!v) throw new AccountingError("Draft not found — it may already be posted.");
    const own = await db.ledger.count({ where: { companyId: ctx.company.id, id: { in: e.lines.map((l) => l.ledgerId) } } });
    if (own !== new Set(e.lines.map((l) => l.ledgerId)).size) throw new AccountingError("Pick ledgers from this company.");
    const before = v.lines.map((l) => l.ledgerId);
    await db.$transaction(async (t) => {
      await t.voucherLine.deleteMany({ where: { voucherId: v.id } });
      await t.voucher.update({ where: { id: v.id }, data: { date: new Date(e.date + "T00:00:00Z"), type: e.type, narration: e.narration, lines: { create: e.lines.map((l, i) => ({ ...l, amountPaise: BigInt(l.amountPaise), sortOrder: i })) } } });
      if (post) await postVoucher(ctx, v.id, t);
    });
    await learnFromCorrection(ctx.company.id, v.aiInput, before, e.lines.map((l) => l.ledgerId));
    revalidatePath("/", "layout");
    const posted = await db.voucher.findUniqueOrThrow({ where: { id: v.id } });
    return { number: posted.number, status: posted.status };
  });
}

export async function discardDraftAction(voucherId: string) {
  return attempt(async () => { await deleteDraft(await getCtx(), voucherId); revalidatePath("/", "layout"); return null; });
}

/** Undo a posted entry from the feed = post a reversal (the original stays in the audit trail). */
export async function undoEntryAction(voucherId: string) {
  return attempt(async () => {
    const rev = await reverseVoucher(await getCtx(), voucherId, "undone from Home");
    revalidatePath("/", "layout");
    return { number: rev.number };
  });
}

/** Load a draft into the editor (e.g. from the recent-entries feed). */
export async function loadDraftAction(voucherId: string) {
  return attempt(async () => {
    const ctx = await getCtx();
    const v = await db.voucher.findFirst({ where: { id: voucherId, companyId: ctx.company.id, status: "DRAFT" }, include: { lines: { include: { ledger: true }, orderBy: { sortOrder: "asc" } } } });
    if (!v) throw new AccountingError("Draft not found.");
    const ai = (v.aiDraft ?? {}) as Partial<ResolvedDraft>;
    const view: DraftView = {
      voucherId: v.id, input: v.aiInput ?? "", date: v.date.toISOString().slice(0, 10), voucherType: v.type as DraftView["voucherType"], narration: v.narration ?? "",
      partyId: v.partyId, partyName: ai.partyName ?? null, lines: v.lines.map((l) => ({ ledgerId: l.ledgerId, ledger: l.ledger.name, side: l.side, amountPaise: n(l.amountPaise) })),
      gst: ai.gst ?? null, tds: ai.tds ?? null, confidence: v.aiConfidence ?? 1, question: ai.question ?? null, engine: ai.engine ?? "rules", warnings: ai.warnings ?? [],
    };
    return view;
  });
}
