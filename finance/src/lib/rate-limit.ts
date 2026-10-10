/**
 * Fixed-window rate limiter for AI endpoints. In-memory: fine for one Node process.
 * On serverless/multi-instance deployments swap for Redis/Upstash (see DECISIONS.md).
 */
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit = 20, windowMs = 60_000): { ok: boolean; retryInSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { count: 1, reset: now + windowMs }); return { ok: true, retryInSec: 0 }; }
  if (b.count >= limit) return { ok: false, retryInSec: Math.ceil((b.reset - now) / 1000) };
  b.count++;
  return { ok: true, retryInSec: 0 };
}
