import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/** Model is configurable; defaults to Claude Opus 5.5. */
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

let client: Anthropic | null | undefined;
/** Server-side only. Returns null when no credentials are configured (the app then uses the rule-based drafter). */
export function getClaude(): Anthropic | null {
  if (client !== undefined) return client;
  client = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic() : null;
  return client;
}
export const aiEnabled = () => getClaude() !== null;
