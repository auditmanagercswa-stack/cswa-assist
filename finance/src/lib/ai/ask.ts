import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { isoDate } from "@/lib/format";
import { todayUTC } from "@/lib/fy";
import type { Ctx } from "@/lib/session";
import { getClaude, MODEL } from "./client";
import { runTool, TOOLS, type ToolResult } from "./ask-tools";
import { periodFromText } from "./period-words";

export interface AskAnswer { answer: string; chart?: ToolResult["chart"]; link?: ToolResult["link"]; engine: "claude" | "rules" }

const SYSTEM = `You answer questions about one Indian business's books using the read-only tools provided.
Always call a tool for figures — never invent numbers. Use dates as YYYY-MM-DD; the Indian financial year runs April–March.
Answer in two or three plain sentences with rupee figures exactly as the tools format them (₹1,30,000 style). Name the period you used.
If the books can't answer the question, say what you can answer instead.`;

/** Tool definitions generated from the zod schemas (one source of truth). */
const toolDefs: Anthropic.Beta.BetaTool[] = Object.entries(TOOLS).map(([name, t]) => ({
  name, description: t.description, input_schema: z.toJSONSchema(t.input) as Anthropic.Beta.BetaTool["input_schema"],
}));

async function askClaude(ctx: Ctx, question: string): Promise<AskAnswer> {
  const claude = getClaude()!;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: `Today is ${isoDate(todayUTC())}. Selected period in the app: ${isoDate(ctx.period.from)} to ${isoDate(ctx.period.to)} (${ctx.period.label}).\n\nQuestion: ${question}` }];
  let last: ToolResult | undefined;
  for (let turn = 0; turn < 5; turn++) {
    const res = await claude.beta.messages.create({
      model: MODEL, max_tokens: 4000, system: SYSTEM, tools: toolDefs, messages,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "low" },
    });
    if (res.stop_reason === "refusal") return { answer: "I can't answer that one. Try asking about income, expenses, dues or balances.", engine: "claude" };
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) {
      const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return { answer: text || "I couldn't find an answer in the books.", chart: last?.chart, link: last?.link, engine: "claude" };
    }
    const results = await Promise.all(uses.map(async (u) => {
      const r = await runTool(ctx.company.id, u.name, u.input);
      if (r.chart?.data.length) last = r;
      return { type: "tool_result" as const, tool_use_id: u.id, content: JSON.stringify(r.summary), is_error: "error" in r.summary };
    }));
    messages.push({ role: "user", content: results });
  }
  return { answer: "That took too many steps — try a more specific question.", chart: last?.chart, link: last?.link, engine: "claude" };
}

/** Keyword router used without an API key. */
async function askRules(ctx: Ctx, question: string): Promise<AskAnswer> {
  const q = question.toLowerCase();
  const p = periodFromText(q, todayUTC(), { from: ctx.period.from, to: ctx.period.to, label: ctx.period.label.toLowerCase() });
  const range = { from: isoDate(p.from), to: isoDate(p.to) };
  const say = (r: ToolResult, text: string): AskAnswer => ({ answer: text, chart: r.chart, link: r.link, engine: "rules" });
  const s = (r: ToolResult) => r.summary as Record<string, string & unknown>;

  if (/owes? me|debtor|receivable|who hasn'?t paid|outstanding from/.test(q)) {
    const r = await runTool(ctx.company.id, "top_debtors", { limit: 5 });
    const c = (s(r).customers as unknown as { name: string; outstanding: string }[]) ?? [];
    return say(r, c.length ? `${c[0].name} owes you the most: ${c[0].outstanding}. In total customers owe ${s(r).totalOutstanding}.` : "No customer owes you anything right now.");
  }
  if (/i owe|creditor|payable|vendors?/.test(q)) {
    const r = await runTool(ctx.company.id, "top_creditors", { limit: 5 });
    const v = (s(r).vendors as unknown as { name: string; outstanding: string }[]) ?? [];
    return say(r, v.length ? `You owe ${v[0].name} the most: ${v[0].outstanding}.` : "You don't owe any vendor right now.");
  }
  if (/gst|itc|input credit/.test(q)) { const r = await runTool(ctx.company.id, "gst_position", range); return say(r, `For ${p.label}: output GST ${s(r).outputTax}, input credit ${s(r).inputCredit}, net payable ${s(r).netPayable}.`); }
  if (/profit|loss|margin|how (am i|are we) doing/.test(q)) { const r = await runTool(ctx.company.id, "profit", range); return say(r, `For ${p.label}: income ${s(r).income}, spent ${s(r).expenses}, net profit ${s(r).netProfit} (${s(r).marginPct}% margin).`); }
  if (/cash|bank balance|balance in|how much money/.test(q)) { const r = await runTool(ctx.company.id, "cash_position", {}); const a = s(r).accounts as unknown as { name: string; balance: string }[]; return say(r, `Balances today: ${a.map((x) => `${x.name} ${x.balance}`).join(", ")}.`); }
  if (/income|sales|revenue|earn/.test(q)) { const r = await runTool(ctx.company.id, "income", range); return say(r, `Income for ${p.label}: ${s(r).income}.`); }
  const spend = /(?:spend|spent|cost|expense|pay|paid)\s+(?:on|for)\s+([a-z &]+?)(?:\s+(?:this|last|in|during)\b|\?|$)/.exec(q);
  if (spend) {
    const r = await runTool(ctx.company.id, "spend_on", { ledger: spend[1].trim(), ...range });
    if ("error" in r.summary) return { answer: `I couldn't find a ledger for “${spend[1].trim()}”. Try the exact ledger name, like Rent or Salaries & Wages.`, engine: "rules" };
    return say(r, `You spent ${s(r).total} on ${(s(r).ledgers as unknown as string[]).join(", ")} in ${p.label}.`);
  }
  if (/expense|spend|spent|where.*money/.test(q)) { const r = await runTool(ctx.company.id, "expense_breakdown", { ...range, limit: 8 }); const it = s(r).items as unknown as { ledger: string; amount: string }[]; return say(r, it.length ? `Biggest costs in ${p.label}: ${it.slice(0, 3).map((x) => `${x.ledger} ${x.amount}`).join(", ")}.` : `No expenses recorded in ${p.label}.`); }
  return { answer: "I can answer questions about income, spending on a ledger, profit, GST, cash & bank balances, and who owes whom. Try “What did I spend on rent this quarter?”", engine: "rules" };
}

export async function askBooks(ctx: Ctx, question: string): Promise<AskAnswer> {
  if (getClaude()) {
    try { return await askClaude(ctx, question); } catch (e) {
      console.error("[ask] Claude failed, using rules:", e instanceof Error ? e.message : e);
    }
  }
  return askRules(ctx, question);
}
