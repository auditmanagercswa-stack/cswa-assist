import "server-only";
import { db } from "@/lib/db";
import { isoDate } from "@/lib/format";
import { todayUTC } from "@/lib/fy";
import { validateLines } from "@/lib/accounting/core";
import type { Ctx } from "@/lib/session";
import { aiEnabled } from "./client";
import { AiUnavailable, claudeDraft } from "./claude";
import { keywordsOf, ruleDraft } from "./rules";
import type { ChartContext, RawDraft, ResolvedDraft } from "./schema";

export async function loadChartContext(ctx: Ctx): Promise<ChartContext> {
  const cid = ctx.company.id;
  const [ledgers, parties, hints] = await Promise.all([
    db.ledger.findMany({ where: { companyId: cid, isActive: true }, include: { group: true }, orderBy: { name: "asc" } }),
    db.party.findMany({ where: { companyId: cid }, orderBy: { name: "asc" } }),
    db.mappingHint.findMany({ where: { companyId: cid }, orderBy: { uses: "desc" }, take: 200 }),
  ]);
  return {
    today: isoDate(todayUTC()), companyName: ctx.company.name, stateCode: ctx.company.stateCode, gstRegistered: !!ctx.company.gstin,
    ledgers: ledgers.map((l) => ({ id: l.id, name: l.name, group: l.group.name, kind: l.kind, aliases: l.aliases })),
    parties: parties.map((p) => ({ id: p.id, name: p.name, kind: p.kind, ledgerId: p.ledgerId, tdsSection: p.tdsSection })),
    hints: hints.map((h) => ({ keyword: h.keyword, ledgerId: h.ledgerId })),
  };
}

/** Map names → ledgers, convert to paise, and check the voucher balances. Never trusts the model blindly. */
export function resolveDraft(raw: RawDraft, chart: ChartContext, engine: ResolvedDraft["engine"]): ResolvedDraft {
  const warnings: string[] = [];
  const norm = (s: string) => s.trim().toLowerCase();
  const suspense = chart.ledgers.find((l) => l.kind === "SUSPENSE")!;
  const find = (name: string) =>
    chart.ledgers.find((l) => norm(l.name) === norm(name)) ??
    chart.ledgers.find((l) => l.aliases.some((a) => norm(a) === norm(name))) ??
    chart.ledgers.find((l) => norm(l.name).includes(norm(name)) || norm(name).includes(norm(l.name)));
  const lines = raw.lines.filter((l) => l.amount > 0).map((l) => {
    const hit = find(l.ledger);
    if (!hit) warnings.push(`"${l.ledger}" isn't in your chart of accounts — parked in Suspense.`);
    const led = hit ?? suspense;
    return { ledgerId: led.id, ledger: led.name, side: l.side, amountPaise: Math.round(l.amount * 100) };
  });
  const errs = validateLines(lines);
  let confidence = Math.max(0, Math.min(1, raw.confidence));
  if (errs.length) { warnings.push(...errs); confidence = Math.min(confidence, 0.4); }
  if (warnings.length) confidence = Math.min(confidence, 0.5);
  const party = raw.party ? chart.parties.find((p) => norm(p.name) === norm(raw.party!)) ?? null : null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : chart.today;
  return {
    date, voucherType: raw.voucherType, narration: raw.narration, partyId: party?.id ?? null, partyName: party?.name ?? raw.party,
    lines, gst: raw.gst, tds: raw.tds ? { section: raw.tds.section, rate: raw.tds.rate, amountPaise: Math.round(raw.tds.amount * 100) } : null,
    confidence, question: raw.question ?? (confidence < 0.6 && !errs.length ? "Does this look right? Edit any line before posting." : null), engine, warnings,
  };
}

/** Text → draft. Tries Claude when configured, falls back to rules. */
export async function draftFromText(ctx: Ctx, text: string): Promise<ResolvedDraft> {
  const chart = await loadChartContext(ctx);
  if (aiEnabled()) {
    try {
      return resolveDraft(await claudeDraft(chart, { text }), chart, "claude");
    } catch (e) {
      const d = resolveDraft(ruleDraft(text, chart), chart, "rules");
      d.warnings.unshift(e instanceof AiUnavailable ? e.message : "AI unavailable — used the rule-based drafter.");
      return d;
    }
  }
  return resolveDraft(ruleDraft(text, chart), chart, "rules");
}

/** Receipt/bill photo → draft (Claude vision). */
export async function draftFromImage(ctx: Ctx, image: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" }, note?: string) {
  const chart = await loadChartContext(ctx);
  return resolveDraft(await claudeDraft(chart, { image, text: note }), chart, "claude");
}

/**
 * Learn from a correction: when the user swaps the AI's ledger for another one,
 * remember the sentence's keywords → the chosen ledger.
 */
export async function learnFromCorrection(companyId: string, sentence: string | null, before: string[], after: string[]) {
  if (!sentence) return;
  const added = after.filter((id) => !before.includes(id));
  if (!added.length) return;
  const kws = keywordsOf(sentence).slice(0, 4);
  for (const ledgerId of added) for (const keyword of kws) {
    await db.mappingHint.upsert({
      where: { companyId_keyword_ledgerId: { companyId, keyword, ledgerId } },
      create: { companyId, keyword, ledgerId },
      update: { uses: { increment: 1 } },
    });
  }
}
