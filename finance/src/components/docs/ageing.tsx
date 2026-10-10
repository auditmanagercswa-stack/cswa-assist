import { inr } from "@/lib/format";
import { Card } from "@/components/ui/card";

const TONES = ["bg-mint", "bg-gold/60", "bg-gold", "bg-danger"];

/** Four ageing buckets as tiles plus a proportional strip. */
export function AgeingSummary({ buckets, total, label }: { buckets: Record<string, number>; total: number; label: string }) {
  const entries = Object.entries(buckets);
  return (
    <Card className="grid gap-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-ink-2">{label}</span>
        <span className="money text-3xl">{inr(total, { round: true })}</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-sand" aria-hidden>
        {entries.map(([k, v], i) => total > 0 && v > 0 ? <span key={k} className={TONES[i]} style={{ width: `${(v / total) * 100}%` }} /> : null)}
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {entries.map(([k, v], i) => (
          <div key={k} className="rounded-2xl bg-cream p-3">
            <dt className="flex items-center gap-1.5 text-xs text-ink-2"><i className={`size-2 rounded-full ${TONES[i]}`} />{k} days</dt>
            <dd className="money mt-1 text-lg">{inr(v, { round: true })}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
