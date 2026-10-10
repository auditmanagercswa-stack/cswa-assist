import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { getClaude, MODEL } from "./client";
import { AiUnavailable } from "./claude";

export const BillExtract = z.object({
  vendorName: z.string().nullable(),
  vendorGstin: z.string().nullable(),
  billNo: z.string().nullable(),
  date: z.string().nullable().describe("YYYY-MM-DD"),
  description: z.string().nullable(),
  hsnSac: z.string().nullable(),
  taxable: z.number().nullable().describe("Taxable value in rupees, before GST"),
  gstRate: z.number().nullable(),
  total: z.number().nullable().describe("Invoice total in rupees"),
});
export type BillFields = z.infer<typeof BillExtract>;

/** Read an Indian GST tax invoice / bill image into structured fields. */
export async function extractBill(image: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" }): Promise<BillFields> {
  const claude = getClaude();
  if (!claude) throw new AiUnavailable("Reading bills needs an Anthropic API key.");
  try {
    const res = await claude.beta.messages.parse({
      model: MODEL, max_tokens: 2000,
      system: "Extract the fields of this Indian purchase bill / tax invoice. Use null for anything not visible. Amounts in rupees.",
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(BillExtract) },
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } }, { type: "text", text: "Extract the bill fields." }] }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) throw new AiUnavailable("Couldn't read that bill.");
    return res.parsed_output;
  } catch (e) {
    if (e instanceof AiUnavailable) throw e;
    if (e instanceof Anthropic.APIError) throw new AiUnavailable(`Bill reading failed (${e.status ?? "network"}).`);
    throw new AiUnavailable("Couldn't read that bill.");
  }
}
