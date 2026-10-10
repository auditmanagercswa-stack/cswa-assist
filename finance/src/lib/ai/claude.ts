import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getClaude, MODEL } from "./client";
import { DraftSchema, type ChartContext, type RawDraft } from "./schema";

/** Stable instructions (cache-friendly: nothing per-request in here). */
const SYSTEM = `You are an Indian chartered accountant's assistant inside a double-entry bookkeeping app.
Turn the owner's plain-English description of a business event (or a photo of a bill/receipt) into ONE draft voucher.

Rules:
- Use only ledger names that appear exactly in the chart of accounts provided. If nothing fits, use "Suspense" and ask a question.
- Debits must equal credits. Amounts are in rupees. "1.2L" = 120000, "25k" = 25000.
- Voucher types: PAYMENT (money out of cash/bank), RECEIPT (money into cash/bank), CONTRA (cash<->bank or bank<->bank),
  SALES (credit sale), PURCHASE (credit purchase / vendor bill not yet paid), JOURNAL (everything else, e.g. provisions, depreciation).
- Cash payments use the "Cash" ledger. If a bank is named, use that bank ledger; otherwise use the first bank ledger.
- GST: only split GST when the text or bill shows GST, or the item is clearly a GST-registered vendor's tax invoice and the company is GST registered.
  Intra-state (same state code) = CGST + SGST halves to Input/Output CGST and SGST ledgers; inter-state = IGST. Fill the gst object with the split.
- TDS: if the payment is to a vendor for rent (194I), professional fees (194J), contract work/freight (194C) or commission (194H) and the
  description says TDS was deducted, credit "TDS Payable" with the TDS and the party/bank with the net. Fill the tds object.
- Salaries, rent, utilities etc. paid directly are PAYMENT vouchers debiting the expense ledger.
- Use the learned hints: they are the owner's past corrections and win over your own guess.
- Dates: resolve relative dates ("yesterday", "on 5th") against today's date. Default to today.
- Narration: short, factual, like "Being office rent for October paid via HDFC".
- confidence: below 0.6 when the account, amount or direction is a guess. When below 0.6, ask exactly one short question.`;

function contextBlock(chart: ChartContext) {
  const ledgers = chart.ledgers.map((l) => `- ${l.name} [${l.group}${l.kind !== "GENERAL" ? `, ${l.kind}` : ""}]`).join("\n");
  const parties = chart.parties.map((p) => `- ${p.name} (${p.kind}${p.tdsSection ? `, TDS ${p.tdsSection}` : ""})`).join("\n") || "(none)";
  const byId = new Map(chart.ledgers.map((l) => [l.id, l.name]));
  const hints = chart.hints.map((h) => `- "${h.keyword}" → ${byId.get(h.ledgerId)}`).join("\n") || "(none yet)";
  return `Company: ${chart.companyName} · state code ${chart.stateCode} · ${chart.gstRegistered ? "GST registered" : "not GST registered"}

Chart of accounts:
${ledgers}

Parties:
${parties}

Learned hints (keyword → ledger):
${hints}`;
}

export class AiUnavailable extends Error {}

/**
 * Ask Claude for a structured draft. The chart of accounts goes in a cached block so repeated
 * entries in a session only pay for it once. Throws AiUnavailable on refusal or bad output.
 */
export async function claudeDraft(chart: ChartContext, input: { text?: string; image?: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" } }): Promise<RawDraft> {
  const claude = getClaude();
  if (!claude) throw new AiUnavailable("No Anthropic credentials configured.");

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: "text", text: contextBlock(chart), cache_control: { type: "ephemeral" } },
  ];
  if (input.image) content.push({ type: "image", source: { type: "base64", media_type: input.image.mediaType, data: input.image.data } });
  content.push({
    type: "text",
    text: `Today is ${chart.today}.\n${input.image ? "Read this bill/receipt and draft the entry for it." : "What happened:"}\n${input.text ?? ""}`.trim(),
  });

  try {
    const res = await claude.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(DraftSchema) },
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) throw new AiUnavailable("The model couldn't draft this entry.");
    return res.parsed_output;
  } catch (e) {
    if (e instanceof AiUnavailable) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new AiUnavailable("AI is busy right now — used the rule-based drafter instead.");
    if (e instanceof Anthropic.APIError) throw new AiUnavailable(`AI request failed (${e.status ?? "network"}).`);
    throw new AiUnavailable("AI returned an unreadable draft.");
  }
}
