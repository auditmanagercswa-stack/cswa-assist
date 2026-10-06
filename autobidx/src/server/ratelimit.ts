// Sliding-window-ish fixed bucket limiter. In-process by default; for multi-instance deployments
// put a shared limiter (Redis / API gateway) in front — the call sites stay the same.
type Bucket = { count: number; resetAt: number };
const g = globalThis as unknown as { __rl?: Map<string, Bucket> };
const buckets = (g.__rl ??= new Map());

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  if (process.env.DISABLE_RATE_LIMIT === "true") return true;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return true;
  }
  b.count++;
  return b.count <= max;
}

export function resetRateLimits() {
  buckets.clear();
}
