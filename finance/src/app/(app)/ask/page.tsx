import { getCtx } from "@/lib/session";
import { aiEnabled } from "@/lib/ai/client";
import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/misc";
import { AskPanel } from "@/components/ask/ask-panel";

export const metadata = { title: "Ask your books" };

export default async function AskPage() {
  const ctx = await getCtx();
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageTitle pre="Ask your" em="books" sub={<>Plain-English questions, answered from {ctx.company.name}&apos;s posted entries. {aiEnabled() ? "Claude picks from read-only queries — it can't change anything." : "Running on built-in question patterns; add ANTHROPIC_API_KEY for open-ended questions."}</>} />
      <Card className="p-5 md:p-6"><AskPanel /></Card>
    </div>
  );
}
